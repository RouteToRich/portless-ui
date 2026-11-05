import axios from "axios";

// Single base URL: the FastAPI gateway acts as the BFF for the Ops Console.
// Falls back to the Vite dev proxy (/api) when VITE_API_BASE_URL is unset.
const baseURL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export const TOKEN_KEY = "portless_token";
export const USER_KEY = "portless_user";

export const api = axios.create({
  baseURL,
  // LLM gateway requests and Mongo fallback retries can legitimately run well
  // past 15s, so give every request up to 2 minutes rather than aborting client-side.
  timeout: 120000,
  headers: { "Content-Type": "application/json" },
});

// Attach the JWT to every outgoing request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 (expired/invalid token), clear the session and bounce to /login.
// Auth endpoints are exempt so login/register can surface their own errors.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url: string = error.config?.url ?? "";
    if (error.response?.status === 401 && !url.includes("/auth/")) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
