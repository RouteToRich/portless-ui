import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { portlessProxy } from "./proxy.config.mjs";
// Compiled twin of vite.config.ts (Vite picks this file first) — keep the two in step.
// Requests take the production path in dev too: /auth/* to auth-service and
// /api/* to the backend, both through the RouteToRich API gateway (or /api/*
// straight to a local backend with BACKEND_PROXY_TARGET). See proxy.config.mjs.
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = Object.assign({}, loadEnv(mode, process.cwd(), ""), process.env);
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
