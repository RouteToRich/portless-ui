import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { portlessProxy } from "./proxy.config.mjs";

// Requests take the production path in dev too: /auth/* to auth-service and
// /api/* to the backend, both through the RouteToRich API gateway (or /api/*
// straight to a local backend with BACKEND_PROXY_TARGET). See proxy.config.mjs.
export default defineConfig(({ mode }) => {
  // "" prefix: also read the non-VITE_ proxy targets from .env.
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      proxy: portlessProxy(env),
    },
    build: {
      target: "esnext",
    },
  };
});
