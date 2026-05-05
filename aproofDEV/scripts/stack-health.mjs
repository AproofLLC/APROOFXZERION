#!/usr/bin/env node
/**
 * Single source of truth for interactive-stack HTTP checks (dev:stack + dev:check).
 * Backend = direct health on PORT/APROOF_PORT (default 3000); route semantics are verified through the Vite proxy (same path as the browser).
 */
/* eslint-disable no-console */

/** Same precedence as APROOF `resolveListenPortFromEnv`: PORT → APROOF_PORT → 3000. */
export function resolveBackendPort(env = process.env) {
  const parse = (raw) => {
    if (raw === undefined) return undefined;
    const t = String(raw).trim();
    if (t === "") return undefined;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return undefined;
    return n;
  };
  return parse(env.PORT) ?? parse(env.APROOF_PORT) ?? 3000;
}

export function getStackUrls(env = process.env) {
  const backendPort = resolveBackendPort(env);
  return {
    backendHealth: `http://127.0.0.1:${backendPort}/health`,
    /** Prefer 127.0.0.1 so checks match IPv4 binds (Windows may resolve `localhost` to ::1 first). */
    frontendRoot: "http://127.0.0.1:5173/",
    proxyHealth: "http://127.0.0.1:5173/health",
  };
}

export const APP_PROOFS_URL = "http://127.0.0.1:5173/app/proofs";

/** Harmless UUID for unauthenticated route-existence probes (auth must fail before DB subject lookup). */
export const USER_LOG_PROBE_SUBJECT_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Fastify's 404 when no route matches (stale server missing handlers).
 * @param {number} status
 * @param {string} text
 */
export function isFastifyRouteNotFound(status, text) {
  return status === 404 && typeof text === "string" && text.includes("not found");
}

/**
 * Probes critical API routes through the Vite dev proxy (matches browser behavior).
 * @returns {{ ok: true } | { ok: false, detail: string }}
 */
export async function checkProxyRouteGuardrails() {
  const base = "http://127.0.0.1:5173";
  const sid = USER_LOG_PROBE_SUBJECT_ID;
  const summaryPath = `/subjects/${sid}/user-logs/summary`;
  const listPath = `/subjects/${sid}/user-logs`;

  try {
    const rSession = await fetch(`${base}/auth/session`, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    });
    const sessionText = await rSession.text();
    if (!rSession.ok) {
      if (isFastifyRouteNotFound(rSession.status, sessionText)) {
        return {
          ok: false,
          detail: `GET /auth/session missing on API behind proxy (stale backend). Stop the stack, restart from current source, rerun npm run dev:check. (${base}/auth/session)`,
        };
      }
      return {
        ok: false,
        detail: `GET /auth/session via proxy: HTTP ${rSession.status} (${base}/auth/session)`,
      };
    }
    let sessionJson;
    try {
      sessionJson = JSON.parse(sessionText);
    } catch {
      return { ok: false, detail: `GET /auth/session via proxy: not JSON (${base}/auth/session)` };
    }
    if (!sessionJson || typeof sessionJson !== "object" || !("authenticated" in sessionJson)) {
      return {
        ok: false,
        detail: `GET /auth/session via proxy: expected { authenticated: ... } (${base}/auth/session)`,
      };
    }

    for (const [label, url, method] of [
      ["GET user-logs/summary", `${base}${summaryPath}`, "GET"],
      ["GET user-logs", `${base}${listPath}`, "GET"],
    ]) {
      const res = await fetch(url, { method, signal: AbortSignal.timeout(8000) });
      const t = await res.text();
      if (res.status === 401) continue;
      if (isFastifyRouteNotFound(res.status, t)) {
        return {
          ok: false,
          detail: `${label} is not registered (stale API process). Restart the backend from current source (e.g. npm run stop:stack then npm run dev:stack). (${url})`,
        };
      }
      return {
        ok: false,
        detail: `${label} via proxy: expected HTTP 401 (unauthenticated); got ${res.status}. (${url})`,
      };
    }

    const rPostLogs = await fetch(`${base}${listPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    const postLogsText = await rPostLogs.text();
    if (rPostLogs.status !== 401) {
      if (isFastifyRouteNotFound(rPostLogs.status, postLogsText)) {
        return {
          ok: false,
          detail: `POST user-logs ingest route missing (stale API). Restart backend from current source. (${base}${listPath})`,
        };
      }
      return {
        ok: false,
        detail: `POST user-logs via proxy: expected HTTP 401 (unauthenticated); got ${rPostLogs.status}. (${base}${listPath})`,
      };
    }

    const rSandbox = await fetch(`${base}/sandbox/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
      signal: AbortSignal.timeout(8000),
    });
    const sandboxText = await rSandbox.text();
    if (isFastifyRouteNotFound(rSandbox.status, sandboxText)) {
      return {
        ok: false,
        detail: `POST /sandbox/session missing on API behind proxy (stale backend). Restart from current source. (${base}/sandbox/session)`,
      };
    }
    /** Invalid JSON body is expected to fail before sandbox work (4xx/5xx), not route-missing 404. */
    if (rSandbox.status < 400) {
      return {
        ok: false,
        detail: `POST /sandbox/session (invalid JSON probe) via proxy: expected an error status; got ${rSandbox.status}. (${base}/sandbox/session)`,
      };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      detail: `${msg} (proxy route guardrails — is Vite on :5173 and proxying to the API port?)`,
    };
  }
}

/**
 * @returns {{ ok: true, layer: string } | { ok: false, layer: string, detail: string }}
 */
export async function checkBackend(env = process.env) {
  const urls = getStackUrls(env);
  try {
    const res = await fetch(urls.backendHealth, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return { ok: false, layer: "Backend", detail: `HTTP ${res.status} (${urls.backendHealth})` };
    }
    const text = await res.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      return { ok: false, layer: "Backend", detail: `not JSON (${urls.backendHealth})` };
    }
    if (j && typeof j === "object" && j.ok === true) {
      return { ok: true, layer: "Backend" };
    }
    return { ok: false, layer: "Backend", detail: `health JSON missing ok:true (${urls.backendHealth})` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, layer: "Backend", detail: `${msg} (${urls.backendHealth})` };
  }
}

/**
 * @returns {{ ok: true, layer: string } | { ok: false, layer: string, detail: string }}
 */
export async function checkFrontend(env = process.env) {
  const urls = getStackUrls(env);
  try {
    const res = await fetch(urls.frontendRoot, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return { ok: false, layer: "Frontend", detail: `HTTP ${res.status} (${urls.frontendRoot})` };
    }
    return { ok: true, layer: "Frontend" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, layer: "Frontend", detail: `${msg} (${urls.frontendRoot})` };
  }
}

/**
 * Health via proxy plus route guardrails (auth/session, user-logs, sandbox POST registered).
 * @returns {{ ok: true, layer: string } | { ok: false, layer: string, detail: string }}
 */
export async function checkProxy(env = process.env) {
  const urls = getStackUrls(env);
  try {
    const res = await fetch(urls.proxyHealth, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return { ok: false, layer: "Proxy", detail: `HTTP ${res.status} (${urls.proxyHealth})` };
    }
    const text = await res.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      return { ok: false, layer: "Proxy", detail: `not JSON (${urls.proxyHealth})` };
    }
    if (!(j && typeof j === "object" && j.ok === true)) {
      return { ok: false, layer: "Proxy", detail: `health JSON missing ok:true (${urls.proxyHealth})` };
    }

    const guard = await checkProxyRouteGuardrails();
    if (!guard.ok) {
      return { ok: false, layer: "Proxy", detail: guard.detail };
    }
    return { ok: true, layer: "Proxy" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, layer: "Proxy", detail: `${msg} (${urls.proxyHealth})` };
  }
}

/**
 * Poll until predicate returns ok or timeout.
 * @param {() => Promise<{ ok: boolean }>} probe
 * @param {{ timeoutMs?: number, intervalMs?: number }} [opts]
 */
export async function waitForHealthy(probe, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 400;
  const deadline = Date.now() + timeoutMs;
  let last = { ok: false };
  while (Date.now() < deadline) {
    last = await probe();
    if (last.ok) return { ok: true, last };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, last };
}
