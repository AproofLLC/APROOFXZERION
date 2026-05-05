#!/usr/bin/env node
/**
 * Quick guardrail: user-log + related proxy routes (requires Vite on :5173 proxying to the API port from PORT/APROOF_PORT or VITE_API_PROXY_TARGET).
 * Same probes as the "Proxy" step in npm run dev:check — use when debugging route registration only.
 */
/* eslint-disable no-console */

import {
  checkProxyRouteGuardrails,
  getStackUrls,
  USER_LOG_PROBE_SUBJECT_ID,
} from "./stack-health.mjs";

async function main() {
  console.log("user-log routes check (via Vite proxy)\n");
  const urls = getStackUrls();
  console.log(`  proxy base: ${urls.proxyHealth.replace(/\/health$/, "")}`);
  console.log(`  probe subject id: ${USER_LOG_PROBE_SUBJECT_ID}\n`);

  const r = await checkProxyRouteGuardrails();
  if (!r.ok) {
    console.error(`  FAIL — ${r.detail}`);
    console.error("\n  Fix: npm run stop:stack, then npm run dev:stack (or start backend + frontend per README).");
    process.exit(1);
  }
  console.log("  OK — GET/POST user-logs routes, GET /auth/session, POST /sandbox/session (probe) respond as expected.");
  process.exit(0);
}

main();
