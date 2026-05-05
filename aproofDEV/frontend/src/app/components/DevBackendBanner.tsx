import { devHealthUserMessage, useDevBackendHealth } from "../../hooks/useDevBackendHealth";

/**
 * Dev-only banner when the configured API (same origin proxy or VITE_API_BASE_URL) is unreachable.
 */
export function DevBackendBanner() {
  const q = useDevBackendHealth();
  if (!import.meta.env.DEV) return null;
  if (q.isSuccess) return null;

  const msg = devHealthUserMessage(q);

  return (
    <div
      role="status"
      className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-950 dark:text-amber-100"
    >
      {msg}
    </div>
  );
}
