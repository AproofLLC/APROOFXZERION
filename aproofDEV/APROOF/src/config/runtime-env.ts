/**
 * Local runtime environment helpers (port, etc.).
 * Precedence for listen port: PORT → APROOF_PORT → 3040.
 *
 * Process env for the API is loaded from `APROOF/.env` (package root) first, then optional
 * `process.cwd()/.env` overrides — see `src/config/load-aproof-env.ts` (imported first from `main.ts`).
 */

export type ListenPortSource = "PORT" | "APROOF_PORT" | "default";

function tryParsePort(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return undefined;
  return n;
}

export function resolveListenPortFromEnv(env: NodeJS.ProcessEnv = process.env): {
  port: number;
  source: ListenPortSource;
} {
  const fromPort = tryParsePort(env.PORT);
  if (fromPort !== undefined) {
    return { port: fromPort, source: "PORT" };
  }
  const fromAproof = tryParsePort(env.APROOF_PORT);
  if (fromAproof !== undefined) {
    return { port: fromAproof, source: "APROOF_PORT" };
  }
  return { port: 3040, source: "default" };
}

/** Log suffix for startup lines, e.g. ` (from PORT)` or ` (default)`. */
export function formatListenPortLogSuffix(source: ListenPortSource): string {
  if (source === "default") return " (default)";
  return ` (from ${source})`;
}
