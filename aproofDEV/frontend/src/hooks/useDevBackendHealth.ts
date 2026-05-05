import { useQuery } from "@tanstack/react-query";
import { resolveRequestUrl } from "../api/client";

/**
 * Dev-only: polls `/health` on the same path the app uses (relative URLs → Vite proxy when
 * `VITE_API_BASE_URL` is unset). Local dev does not probe the API port directly from the browser.
 */
export function useDevBackendHealth() {
  const dev = import.meta.env.DEV;
  const explicitApi = !!(import.meta.env.VITE_API_BASE_URL ?? "").trim();

  return useQuery({
    queryKey: ["devBackendHealth", import.meta.env.VITE_API_BASE_URL ?? "", explicitApi],
    enabled: dev,
    queryFn: async () => {
      const res = await fetch(resolveRequestUrl("/health"), {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = text;
        }
      }
      const ok =
        body && typeof body === "object" && (body as { ok?: unknown }).ok === true;
      if (!ok) {
        throw new Error("Health payload missing ok:true");
      }
      return { ok: true as const };
    },
    refetchInterval: dev ? 5000 : false,
    retry: dev ? 5 : 1,
    retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 8000),
    staleTime: 3000,
  });
}

/** True when sandbox entry should be blocked (dev + API unreachable via app path). */
export function isDevApiUnavailable(q: ReturnType<typeof useDevBackendHealth>): boolean {
  if (!import.meta.env.DEV) return false;
  return q.isPending || q.isError;
}

/** User-facing copy for dev banner and access gateway (dev only). */
export function devHealthUserMessage(q: ReturnType<typeof useDevBackendHealth>): string {
  if (!import.meta.env.DEV) return "";
  if (q.isSuccess) return "";
  if (q.isPending) return "Checking API connection…";
  const detail =
    q.isError && q.error instanceof Error
      ? ` — ${q.error.message}`
      : q.isError && q.error != null
        ? ` — ${String(q.error)}`
        : "";
  if (import.meta.env.VITE_API_BASE_URL) {
    return `Cannot reach API at ${import.meta.env.VITE_API_BASE_URL} — confirm the backend is running.${detail}`;
  }
  return (
    "Cannot reach the API through the Vite dev server — run npm run dev:stack from the repo root " +
    "(or cd APROOF && npm run dev plus cd frontend && npm run dev), then npm run dev:check. " +
    "If you start Vite alone, set APROOF_PORT to the API port or VITE_API_PROXY_TARGET (do not rely on a shell PORT=5173). " +
    "Local dev uses the proxy only; do not open the API URL directly in the browser." +
    detail
  );
}
