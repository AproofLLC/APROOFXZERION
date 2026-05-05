#!/usr/bin/env node
/* eslint-disable no-console */
import { spawn } from "node:child_process";

const MAX_RESTARTS = Number(process.env.APROOF_DEVSTACK_MAX_RESTARTS ?? "3");
const RESTART_DELAY_MS = Number(process.env.APROOF_DEVSTACK_RESTART_DELAY_MS ?? "3000");

function runOnce() {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/dev-stack.mjs"], {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    child.on("exit", (code, signal) => resolve({ code: code ?? 1, signal: signal ?? null }));
    child.on("error", () => resolve({ code: 1, signal: null }));
  });
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  let attempts = 0;
  while (true) {
    const result = await runOnce();
    if (result.code === 0) process.exit(0);
    attempts += 1;
    if (attempts > MAX_RESTARTS) {
      console.error(
        `[dev:stack:supervised] Stack exited repeatedly (attempts=${attempts - 1}). Giving up.`,
      );
      process.exit(result.code);
    }
    console.warn(
      `[dev:stack:supervised] Stack exited (${result.signal || `code ${result.code}`}). Auto-restarting in ${RESTART_DELAY_MS}ms (${attempts}/${MAX_RESTARTS})...`,
    );
    await sleep(RESTART_DELAY_MS);
  }
}

main().catch(() => process.exit(1));
