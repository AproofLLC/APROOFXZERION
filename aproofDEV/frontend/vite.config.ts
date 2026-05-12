import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

function resolveLocalApiProxyTarget(): string {
  const explicit = process.env.VITE_API_PROXY_TARGET?.trim();
  if (explicit) return explicit;
  /**
   * Do not use shell `PORT` here — it is often the *frontend* dev port (e.g. 5273), which would
   * loop proxy traffic through Vite and break `/health`. Precedence matches common local setup:
   * `VITE_API_PORT` (frontend .env) → `APROOF_PORT` (shared with backend naming) → 3040.
   * For a non-loopback host or HTTPS API, set `VITE_API_PROXY_TARGET` to a full URL.
   */
  const raw = process.env.VITE_API_PORT?.trim() || process.env.APROOF_PORT?.trim() || "3040";
  const n = Number(String(raw).trim());
  const port = Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 3040;
  return `http://127.0.0.1:${port}`;
}

const target = resolveLocalApiProxyTarget();

/**
 * Dev + preview: same proxy so API calls work with empty VITE_API_BASE_URL (relative URLs).
 * Prefixes must cover all browser-facing API paths (local dev always uses this proxy, not direct :3040).
 * /health, /auth, /sandbox, /subjects, /events, /proofs, /lineages, /failures, /settings (target: VITE_API_PROXY_TARGET or 127.0.0.1:VITE_API_PORT or APROOF_PORT, default 3040)
 */
const apiProxy: Record<string, ProxyOptions> = {
  "/auth": { target, changeOrigin: true },
  "/subjects": { target, changeOrigin: true },
  "/events": { target, changeOrigin: true },
  "/proofs": { target, changeOrigin: true },
  "/lineages": { target, changeOrigin: true },
  "/failures": { target, changeOrigin: true },
  "/settings": { target, changeOrigin: true },
  "/health": { target, changeOrigin: true },
  "/sandbox": { target, changeOrigin: true },
};

function figmaAssetResolver() {
  return {
    name: "figma-asset-resolver",
    resolveId(id: string) {
      if (id.startsWith("figma:asset/")) {
        const filename = id.replace("figma:asset/", "");
        return path.resolve(__dirname, "src/assets", filename);
      }
    },
  };
}

export default defineConfig({
  plugins: [figmaAssetResolver(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@aproof/baselines": path.resolve(__dirname, "../APROOF/src/baselines"),
    },
  },
  assetsInclude: ["**/*.svg", "**/*.csv"],
  server: {
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
    /** IPv4 loopback so `http://127.0.0.1:5273` matches Windows harness + stack checks (localhost can be ::1-only). */
    host: "127.0.0.1",
    port: 5273,
    /** Avoid silently moving to 5274+ so the HMR WebSocket URL always matches the page origin. */
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: "127.0.0.1",
    port: 4273,
    proxy: apiProxy,
  },
});
