import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/analyze": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/extract-pdf": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/auth": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/mechanics": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/manuscripts": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/scans": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/subscription": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/profile": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/account": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
