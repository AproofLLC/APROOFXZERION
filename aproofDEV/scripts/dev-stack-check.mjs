#!/usr/bin/env node
/**
 * Explicit readiness: backend direct /health, Vite root, then proxy /health + route guardrails
 * (auth/session, user-logs, sandbox) — same path the browser uses. Run any time to see which layer is down.
 */
/* eslint-disable no-console */

import { checkBackend, checkFrontend, checkProxy, APP_PROOFS_URL } from "./stack-health.mjs";

async function main() {
  console.log(
    "dev:check — interactive stack readiness (local dev uses Vite proxy only; do not use the browser against the API port directly)\n",
  );

  const r1 = await checkBackend();
  const r2 = await checkFrontend();
  const r3 = await checkProxy();

  const rows = [
    { label: "Backend", r: r1 },
    { label: "Frontend", r: r2 },
    { label: "Proxy (health + routes)", r: r3 },
  ];

  for (const { label, r } of rows) {
    const line = r.ok ? `  OK   ${label}` : `  FAIL ${label} — ${r.detail}`;
    console.log(line);
  }

  if (!r1.ok || !r2.ok || !r3.ok) {
    console.error("\n[dev:check] FAILED");
    if (!r1.ok) {
      console.error(
        "  → Backend: start the API (cd APROOF && npm run dev; default :3000, or set PORT/APROOF_PORT), or npm run dev:stack from repo root.",
      );
    }
    if (!r2.ok) {
      console.error("  → Frontend: start Vite on :5173 (cd frontend && npm run dev), or npm run dev:stack.");
    }
    if (r1.ok && r2.ok && !r3.ok) {
      console.error(
        "  → Proxy: Vite → API failed, or route guardrails failed (stale API missing routes, or proxy misconfigured).",
      );
      console.error("     Try: npm run stop:stack, then npm run dev:stack. Ensure backend is built from current source.");
      console.error(
        "     Check VITE_API_PROXY_TARGET or APROOF_PORT vs the API (vite.config.ts does not use generic PORT — it may point at the wrong port if only PORT was set for the UI).",
      );
    }
    process.exit(1);
  }

  console.log(`\n[dev:check] PASS — open ${APP_PROOFS_URL}`);
  process.exit(0);
}

main();
