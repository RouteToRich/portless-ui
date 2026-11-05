import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AuthApi } from "@/api/endpoints";
import {
  SESSION_EVENT,
  SessionEndedError,
  TOKEN_KEY,
  USER_KEY,
  clearSession,
  endSession,
  msUntilRefresh,
  refreshAccessToken,
  storeToken,
} from "@/api/client";
import { PORTLESS_ACCOUNT_ID, isAccountConfigured } from "@/config/accounts";
import type { AuthUser } from "@/api/types";

// Sign-in works like MakeMeRich: auth-service (through the gateway's /auth/*)
// checks the password and issues the token, scoped to PortLess's app account.
// The PortLess backend then answers GET /identity/me with what auth-service
// does not know — the organization and the Portless-staff flag — which is what
// the UI keeps as `user`.

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  if (!localStorage.getItem(TOKEN_KEY)) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function requireAccount() {
  if (!isAccountConfigured) {
    throw new Error(
      "This console has no PortLess app account configured (VITE_PORTLESS_ACCOUNT_ID), so it cannot sign anyone in yet."
    );
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    refreshTimer.current = setTimeout(async () => {
      try {
        await refreshAccessToken(token);
      } catch (error) {
        if (error instanceof SessionEndedError) {
          endSession();
          return;
        }
        // network blip / cold start: stay signed in and try again shortly
      }
      scheduleRefresh();
    }, msUntilRefresh(token));
  }, []);

  // Token in hand → ask the backend who that is to PortLess.
  const loadProfile = useCallback(async () => {
    const profile = await AuthApi.me();
    localStorage.setItem(USER_KEY, JSON.stringify(profile));
    setUser(profile);
    return profile;
  }, []);

  const startSession = useCallback(
    async (token: string) => {
      storeToken(token);
      try {
        await loadProfile();
      } catch (error) {
        clearSession();
        setUser(null);
        throw error;
      }
      scheduleRefresh();
    },
    [loadProfile, scheduleRefresh]
  );

  // On load with a stored token: refresh the profile (an admin may have
  // assigned an organization since) and resume the refresh timer.
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    scheduleRefresh();
    loadProfile().catch(() => {
      // a 401 already ended the session in the client interceptor
    });
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [loadProfile, scheduleRefresh]);

  // Another tab signed in, refreshed or signed out.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TOKEN_KEY && e.key !== null) return;
      if (!localStorage.getItem(TOKEN_KEY)) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        setUser(null);
      } else {
        scheduleRefresh();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scheduleRefresh]);

  // Same-tab session changes (refresh rotated the token, client ended the session).
  useEffect(() => {
    const onSession = () => {
      if (!localStorage.getItem(TOKEN_KEY)) setUser(null);
    };
    window.addEventListener(SESSION_EVENT, onSession);
    return () => window.removeEventListener(SESSION_EVENT, onSession);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      requireAccount();
      const res = await AuthApi.login({ email, password, account_id: PORTLESS_ACCOUNT_ID });
      await startSession(res.access_token);
    },
    [startSession]
  );

  // auth-service's register returns a TokenResponse — signing up signs you in.
  const register = useCallback(
    async (email: string, name: string, password: string) => {
      requireAccount();
      const res = await AuthApi.register({ email, name, password, account_id: PORTLESS_ACCOUNT_ID });
      await startSession(res.access_token);
    },
    [startSession]
  );

  const logout = useCallback(async () => {
    try {
      // Revoke the token at auth-service. Best-effort — local cleanup runs regardless.
      await AuthApi.logout();
    } catch {
      // ignore
    } finally {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      clearSession();
      setUser(null);
      qc.clear(); // drop the previous user's cached data
      navigate("/login", { replace: true });
    }
  }, [navigate, qc]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: Boolean(user), login, register, logout }),
    [user, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
