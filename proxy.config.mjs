// Dev-server mirror of vercel.json, so local development takes the SAME path
// production does — the same routing MakeMeRich's frontend uses:
//
//   /auth/*  ->  <gateway>/auth/*            (auth-service: sign-in, sign-up,
//                                             refresh, logout, password reset)
//   /api/*   ->  <gateway>/api/portless/*    (the PortLess backend)
//
// /auth/* is forwarded unchanged — those are auth-service's own paths.
// /api/* is namespaced because the backend serves its data at the root, and
// paths like /deals or /catalogue are also pages of this app.
//
// GATEWAY_PROXY_TARGET   the RouteToRich API gateway (default: the deployed one).
// BACKEND_PROXY_TARGET   send /api/* straight to a backend instead (e.g. your
//                        local monolith on http://localhost:8081, whose paths
//                        have no prefix). The backend checks each token with
//                        the gateway itself, so sign-in still works.
//
// Neither is a VITE_ variable: they are read by the dev server only and never
// reach the browser bundle, which stays same-origin (no CORS).
//
// Shared by vite.config.ts, the compiled vite.config.js and dev-server.mjs.

export const DEFAULT_GATEWAY = "https://api-gateway-two-nu.vercel.app";

const trim = (url) => (url || "").trim().replace(/\/+$/, "");

export function portlessProxy(env = {}) {
  const gateway = trim(env.GATEWAY_PROXY_TARGET) || DEFAULT_GATEWAY;
  const backend = trim(env.BACKEND_PROXY_TARGET);
  return {
    "/auth": { target: gateway, changeOrigin: true, secure: true },
    "/api": backend
      ? { target: backend, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") }
      : {
          target: gateway,
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/api/, "/api/portless"),
        },
  };
}
