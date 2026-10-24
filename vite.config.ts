import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// The UI talks to the combined dev server on port 8081.
// Every module is reachable at its own prefix (e.g. /api/deals/..., /api/trade-min/...).
// For microservices production mode set VITE_API_BASE_URL to the gateway URL.

// Mock-mode fixtures are the backend's documented mocked/ set, in the portless
// repo checked out next to this one (../portless/backend/mocked). Override with
// PORTLESS_MOCKED_DIR when the backend lives elsewhere.
const mockedDir = process.env.PORTLESS_MOCKED_DIR
  ? path.resolve(process.env.PORTLESS_MOCKED_DIR)
  : path.resolve(__dirname, "../portless/backend/mocked");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@mocked": mockedDir,
    },
  },
  server: {
    port: 5173,
    // Allow importing the JSON fixtures from outside the ui root.
    fs: {
      allow: [path.resolve(__dirname), mockedDir],
    },
    proxy: {
      "/api": {
        target: "http://localhost:8081",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    target: "esnext",
  },
});
