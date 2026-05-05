#!/usr/bin/env node
/* eslint-disable no-console */
import { spawn } from "node:child_process";

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
      ...options,
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function main() {
  const profile = (process.argv[2] ?? "devnet").trim().toLowerCase();
  const skipStop = process.argv.includes("--skip-stop");

  if (profile !== "devnet") {
    console.error("[dev:stack:profile] Invalid profile. This repo enforces: devnet");
    process.exit(1);
  }

  if (!skipStop) {
    const stopped = await run("npm", ["run", "stop:stack"]);
    if (stopped !== 0) {
      console.error("[dev:stack:profile] Failed to stop current stack.");
      process.exit(stopped);
    }
  }

  const env = { ...process.env };
  env.ANCHOR_MODE = "solana-devnet";
  env.SOLANA_CLUSTER = "devnet";
  env.APROOF_REQUIRE_DEVNET_FOR_DEMO = "1";
  console.log("[dev:stack:profile] Starting devnet-secure profile (ANCHOR_MODE=solana-devnet).");
  console.log("[dev:stack:profile] Running Devnet preflight smoke before stack startup...");
  const smoke = await run("npm", ["run", "anchor:devnet:smoke", "--prefix", "APROOF"], { env });
  if (smoke !== 0) {
    console.error("[dev:stack:profile] Devnet preflight failed. Stack not started.");
    process.exit(smoke);
  }

  const started = await run("node", ["scripts/dev-stack-supervised.mjs"], { env });
  process.exit(started);
}

main().catch(() => process.exit(1));
