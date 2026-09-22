import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Browser always calls same-origin `/api/*` (see src/api.js).
 *
 * Production: no proxy — Vercel serves `/api/*` as serverless functions on the same host.
 *
 * Local `vite` only: proxy `/api` → local uvicorn (or `vercel dev`).
 * VITE_API_PROXY_TARGET is never baked into the client bundle.
 */
function apiProxy(env) {
  const target = (env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000").trim();
  const isRemote = /^https:\/\//i.test(target);

  return {
    "/api": {
      target,
      changeOrigin: true,
      secure: true,
      timeout: 300_000,
      proxyTimeout: 300_000,
      // Local uvicorn mounts /health, not /api/health.
      // Remote (e.g. vercel.dev) already expects /api prefix — do not rewrite.
      rewrite: isRemote ? undefined : (path) => path.replace(/^\/api/, "") || "/",
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      },
      hmr: {
        clientPort: 5173,
      },
      proxy: apiProxy(env),
    },
  };
});
