import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";

// ── Everything goes through the RouteToRich API gateway ─────────────────────
//
// Same routing as MakeMeRich's frontend. Both paths are same-origin; the
// rewrite layer (vercel.json deployed, proxy.config.mjs in dev) forwards them:
//
//   /api/*   ->  <gateway>/api/portless/*   the PortLess backend (data)
//   /auth/*  ->  <gateway>/auth/*           auth-service (sign-in, sign-up,
//                                           refresh, logout)
//
// No absolute URL reaches the bundle, so there is no CORS to configure. The one
// exception is the approvals SSE stream — see hooks.ts::useApprovalStream.
export const API_BASE_PATH = "/api";

export const TOKEN_KEY = "portless_token";
export const USER_KEY = "portless_user";

// LLM gateway requests and Mongo fallback retries can legitimately run well
// past 15s, so give every request up to 2 minutes rather than aborting client-side.
const TIMEOUT_MS = 120000;

export const api = axios.create({
  baseURL: API_BASE_PATH,
  timeout: TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

// auth-service's own paths, verbatim ("/auth/login", not "/api/auth/login").
export const authApi = axios.create({
  baseURL: "",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// The token is read from storage per request, so the two instances can never
// disagree about who is signed in.
function attachToken(config: InternalAxiosRequestConfig) {
  const token = localStorage.getItem(TOKEN_KEY);
  config.headers = config.headers ?? {};
  if (token) config.headers.Authorization = `Bearer ${token}`;
  else delete config.headers.Authorization;
  return config;
}
api.interceptors.request.use(attachToken);
authApi.interceptors.request.use(attachToken);

// ── Session storage + announcements ─────────────────────────────────────────

export const SESSION_EVENT = "portless:session";
const announce = () => window.dispatchEvent(new Event(SESSION_EVENT));

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  announce();
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  announce();
}

/** Local sign-out with a full reload to /login (drops cached pages and the SSE stream). */
export function endSession() {
  clearSession();
  if (window.location.pathname !== "/login") window.location.href = "/login";
}

// ── Token refresh ───────────────────────────────────────────────────────────
//
// auth-service ROTATES on refresh: each token can be exchanged exactly once and
// the old one is revoked. So two refreshes of the same token (several requests
// 401ing together, two tabs whose timers fire together) would sign the user out
// on the second. Every refresh goes through here, as in MakeMeRich:
//   * single-flight within a tab, serialized across tabs with Web Locks;
//   * skipped when another tab already rotated the token;
//   * only an explicit 401/403 from auth-service ends the session — a network
//     blip or a cold start leaves the user signed in.

export class SessionEndedError extends Error {}

const rejectedByAuth = (error: unknown) =>
  axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0);

function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  return locks?.request ? (locks.request("portless-token-refresh", fn) as Promise<T>) : fn();
}

let refreshInFlight: Promise<string> | null = null;

export function refreshAccessToken(staleToken?: string): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = withRefreshLock(async () => {
      const current = localStorage.getItem(TOKEN_KEY);
      if (!current) throw new SessionEndedError("Signed out");
      if (staleToken && current !== staleToken) return current;
      try {
        const { data } = await authApi.post<{ access_token: string }>("/auth/refresh-token");
        if (!data?.access_token) throw new Error("refresh returned no access_token");
        storeToken(data.access_token);
        return data.access_token;
      } catch (error) {
        const latest = localStorage.getItem(TOKEN_KEY);
        if (latest && latest !== current) return latest; // another tab rotated it
        if (rejectedByAuth(error)) throw new SessionEndedError("Session expired");
        throw error;
      }
    }).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Milliseconds until the token should be refreshed: 2 min before `exp`, at least 1 min out. */
export function msUntilRefresh(token: string): number {
  try {
    const { exp } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return Math.max(60_000, exp * 1000 - Date.now() - 120_000);
  } catch {
    return 45 * 60_000;
  }
}

// ── Responses ───────────────────────────────────────────────────────────────

// A missing rewrite does not FAIL: the static host answers /api/* and /auth/*
// with index.html (200, text/html), or a POST with an empty 200. Refuse that by
// name instead of letting a page choke on HTML much later.
let warnedAboutRewrite = false;
function rejectHtmlAsData(response: AxiosResponse) {
  const type = String(response.headers?.["content-type"] ?? "");
  const isHtml = type.includes("text/html");
  const isEmpty200 = response.status === 200 && !type && (response.data === "" || response.data == null);
  if (!isHtml && !isEmpty200) return response;
  const where = `${(response.config?.method ?? "get").toUpperCase()} ${response.config?.url}`;
  const message =
    `API rewrite missing: ${where} answered with ${isHtml ? "index.html" : "an empty body"}. ` +
    "The host is not forwarding /api/* and /auth/* to the gateway — see vercel.json.";
  if (!warnedAboutRewrite) {
    warnedAboutRewrite = true;
    // eslint-disable-next-line no-console
    console.error(message);
  }
  const err = new AxiosError(message, "ERR_REWRITE_MISSING", response.config, response.request, response);
  return Promise.reject(err);
}
authApi.interceptors.response.use(rejectHtmlAsData);

// A data call that 401s gets one refresh + retry; a session auth-service
// refuses ends here. Downloads (responseType blob) skip the HTML guard.
api.interceptors.response.use(
  (res) => (res.config.responseType === "blob" ? res : rejectHtmlAsData(res)),
  async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status !== 401 || !config || config._retried) {
      if (error.response?.status === 401) endSession();
      return Promise.reject(error);
    }
    const sent = String(config.headers?.Authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!sent) {
      endSession();
      return Promise.reject(error);
    }
    try {
      const token = await refreshAccessToken(sent);
      config._retried = true;
      config.headers.Authorization = `Bearer ${token}`;
      return api.request(config);
    } catch (refreshError) {
      if (refreshError instanceof SessionEndedError) endSession();
      return Promise.reject(error);
    }
  }
);

/**
 * One sentence for any auth / API error. Shapes seen here:
 *   { error: { code, message } }   auth-service and the gateway
 *   { detail: string | [...] }     FastAPI (PortLess backend, validation)
 */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : fallback;
  const data = error.response?.data as
    | { error?: { message?: string }; detail?: unknown; message?: string }
    | undefined;
  if (data?.error?.message) return data.error.message;
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail)) {
    return data.detail
      .map((d) => (typeof d === "string" ? d : (d as { msg?: string })?.msg ?? "Validation error"))
      .join(", ");
  }
  if (typeof data?.message === "string") return data.message;
  return error.message || fallback;
}
