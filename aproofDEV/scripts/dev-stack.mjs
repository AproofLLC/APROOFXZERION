#!/usr/bin/env node
/**
 * Interactive stack orchestrator: backend → wait → frontend → wait → proxy (health + route guardrails) → READY.
 * Does not report ready until all three layers pass the same checks as `npm run dev:check`.
 */
/* eslint-disable no-console */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkBackend,
  checkFrontend,
  checkProxy,
  waitForHealthy,
  APP_PROOFS_URL,
  resolveBackendPort,
} from "./stack-health.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const aproofDir = path.join(root, "APROOF");
const frontendDir = path.join(root, "frontend");

/** @type {import('node:child_process').ChildProcess | null} */
let apiChild = null;
/** @type {import('node:child_process').ChildProcess | null} */
let uiChild = null;
let ready = false;

function spawnNpmDev(cwd, label, envOverrides = {}) {
  const child = spawn("npm", ["run", "dev"], {
    cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...envOverrides },
  });
  child.on("error", (err) => {
    console.error(`[dev:stack] ${label} failed to spawn:`, err.message);
  });
  return child;
}

function killChildren() {
  try {
    if (apiChild && !apiChild.killed) apiChild.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  try {
    if (uiChild && !uiChild.killed) uiChild.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}

function onFatal(message, hint) {
  console.error(`\n[dev:stack] FAILED — ${message}`);
  if (hint) console.error(`  ${hint}`);
  killChildren();
  process.exit(1);
}

async function main() {
  const apiPort = resolveBackendPort(process.env);
  console.log(
    `\n  Interactive stack — backend :${apiPort} + Vite :5173 (browser uses Vite proxy only; do not open the API port directly in the browser).\n`,
  );

  apiChild = spawnNpmDev(aproofDir, "api");
  apiChild.on("exit", (code, signal) => {
    if (ready) {
      console.error(`\n[dev:stack] API process ended (${signal || `code ${code}`}). Stopping UI…`);
      killChildren();
      process.exit(code ?? 1);
    } else if (code !== 0 && code !== null) {
      onFatal("API exited before the stack became ready.", "Check APROOF logs above. Try: npm run stop:stack");
    }
  });

  const w1 = await waitForHealthy(async () => {
    const r = await checkBackend();
    return r;
  });
  if (!w1.ok || !w1.last?.ok) {
    console.log("  Backend:   FAIL");
    onFatal(
      `backend did not become healthy on :${apiPort} within the timeout.`,
      `Ensure port ${apiPort} is free: npm run stop:stack`,
    );
  }
  console.log("  Backend:   OK");

  uiChild = spawnNpmDev(frontendDir, "ui", {
    VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
  });
  uiChild.on("exit", (code, signal) => {
    if (ready) {
      console.error(`\n[dev:stack] UI process ended (${signal || `code ${code}`}). Stopping API…`);
      killChildren();
      process.exit(code ?? 1);
    } else if (code !== 0 && code !== null) {
      onFatal("frontend exited before the stack became ready.", "Check frontend logs above.");
    }
  });

  const w2 = await waitForHealthy(async () => {
    const r = await checkFrontend();
    return r;
  });
  if (!w2.ok || !w2.last?.ok) {
    console.log("  Frontend:  FAIL");
    onFatal("Vite did not become reachable on :5173 within the timeout.", "Check frontend/vite logs above.");
  }
  console.log("  Frontend:  OK");

  const w3 = await waitForHealthy(async () => {
    const r = await checkProxy();
    return r;
  });
  if (!w3.ok || !w3.last?.ok) {
    console.log("  Proxy:     FAIL");
    onFatal(
      "/health via the Vite proxy did not match backend health.",
      "Backend is up; check PORT/APROOF_PORT match between API and Vite (or set VITE_API_PROXY_TARGET) and vite.config.ts proxy for /health.",
    );
  }
  console.log("  Proxy:     OK");

  ready = true;
  console.log(`\n  App ready at: ${APP_PROOFS_URL}`);
  console.log(`  API is at :${apiPort} for the proxy only — use the URLs above in the browser.`);
  console.log("  Stop: Ctrl+C here, or from another terminal: npm run stop:stack\n");

  await new Promise(() => {});
}

function shutdown() {
  if (!ready) killChildren();
  else killChildren();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((e) => {
  console.error(e);
  killChildren();
  process.exit(1);
});
