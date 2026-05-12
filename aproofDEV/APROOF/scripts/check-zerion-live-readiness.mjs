#!/usr/bin/env node
/**
 * Safe Zerion + Solana devnet readiness report (same env files as the API: APROOF/.env, then cwd .env).
 * Prints presence booleans, public addresses, balances — never API key values or secret key bytes.
 */
/* eslint-disable no-console */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const require = createRequire(import.meta.url);
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } = require("@solana/web3.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aproofRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(aproofRoot, ".env") });
const cw = process.cwd();
if (path.normalize(path.resolve(cw)) !== path.normalize(aproofRoot)) {
  dotenv.config({ path: path.join(cw, ".env"), override: true });
}

function existsFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function readPubFromKeypairJson(abs) {
  try {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
    if (!Array.isArray(raw) || raw.length !== 64 || raw.some((n) => !Number.isInteger(n))) return null;
    return Keypair.fromSecretKey(Uint8Array.from(raw)).publicKey.toBase58();
  } catch {
    return null;
  }
}

function boolLine(label, v) {
  console.log(`${label}: ${v ? "true" : "false"}`);
}

async function main() {
  const env = process.env;
  console.log("APROOF package root:", aproofRoot);
  console.log("process.cwd():", cw);
  console.log("");
  console.log("--- Env presence (values never printed) ---");
  boolLine("ZERION_API_KEY present", Boolean(env.ZERION_API_KEY?.trim()));
  boolLine("SOLANA_RPC_URL present", Boolean(env.SOLANA_RPC_URL?.trim()));
  boolLine("ZERION_CLI_PATH present", Boolean(env.ZERION_CLI_PATH?.trim()));
  boolLine("ZERION_AGENT_WALLET_ADDRESS present", Boolean(env.ZERION_AGENT_WALLET_ADDRESS?.trim()));
  boolLine("ZERION_AGENT_KEYPAIR_PATH present", Boolean(env.ZERION_AGENT_KEYPAIR_PATH?.trim()));
  boolLine("SOLANA_KEYPAIR_PATH present", Boolean(env.SOLANA_KEYPAIR_PATH?.trim()));
  const anchorGate =
    env.ANCHOR_MODE?.trim().toLowerCase() === "solana-devnet" ||
    (env.APROOF_ENV ?? "").trim().toLowerCase() === "solana-devnet";
  boolLine("ANCHOR_MODE/APROOF_ENV devnet gate", anchorGate);

  const cliRaw = env.ZERION_CLI_PATH?.trim() ?? "";
  const cliAbs = cliRaw ? (path.isAbsolute(cliRaw) ? cliRaw : path.resolve(aproofRoot, cliRaw)) : "";
  const bundled = path.join(aproofRoot, "scripts", "aproof-agent-devnet-execute.mjs");
  const cliEff = cliAbs || (existsFile(bundled) ? bundled : "");
  boolLine("ZERION_CLI file exists", Boolean(cliEff && existsFile(cliEff)));

  const zKpRaw = env.ZERION_AGENT_KEYPAIR_PATH?.trim() ?? "";
  const zKpAbs = zKpRaw ? (path.isAbsolute(zKpRaw) ? zKpRaw : path.resolve(aproofRoot, zKpRaw)) : "";
  const zKpLocal = path.join(aproofRoot, ".local", "zerion-agent-keypair.json");
  const zKpEff = zKpAbs || (existsFile(zKpLocal) ? zKpLocal : "");
  boolLine("Zerion agent keypair file exists", Boolean(zKpEff && existsFile(zKpEff)));

  const solKpRaw = env.SOLANA_KEYPAIR_PATH?.trim() ?? "";
  const solKpAbs = solKpRaw ? (path.isAbsolute(solKpRaw) ? solKpRaw : path.resolve(aproofRoot, solKpRaw)) : "";
  boolLine("SOLANA_KEYPAIR file exists", Boolean(solKpAbs && existsFile(solKpAbs)));

  const execPubFromEnv = env.ZERION_AGENT_WALLET_ADDRESS?.trim() ?? "";
  const execPubDerived = zKpEff && existsFile(zKpEff) ? readPubFromKeypairJson(zKpEff) : null;
  const execPub = execPubFromEnv || execPubDerived || "";

  if (execPubFromEnv && execPubDerived && execPubFromEnv !== execPubDerived) {
    console.log("");
    console.log("NEXT: ZERION_AGENT_WALLET_ADDRESS does not match pubkey derived from ZERION_AGENT_KEYPAIR_PATH.");
  }

  const anchorPub = solKpAbs && existsFile(solKpAbs) ? readPubFromKeypairJson(solKpAbs) : null;

  console.log("");
  console.log("--- Public addresses ---");
  console.log("Execution wallet (env or derived):", execPub || "(none)");
  console.log("Anchor wallet (from SOLANA_KEYPAIR_PATH):", anchorPub || "(unreadable or missing file)");

  const rpcUrl = env.SOLANA_RPC_URL?.trim() || clusterApiUrl("devnet");
  console.log("");
  console.log("--- Balances (devnet RPC) ---");
  let execBal = null;
  let anchorBal = null;
  try {
    const c = new Connection(rpcUrl, "confirmed");
    if (execPub) {
      try {
        execBal = await c.getBalance(new PublicKey(execPub), "confirmed");
      } catch {
        execBal = null;
      }
    }
    if (anchorPub) {
      try {
        anchorBal = await c.getBalance(new PublicKey(anchorPub), "confirmed");
      } catch {
        anchorBal = null;
      }
    }
  } catch {
    console.log("RPC: could not construct connection — check SOLANA_RPC_URL.");
  }
  if (execPub) {
    console.log(
      execBal == null
        ? "Execution wallet balance: unavailable (RPC error or rate limit)"
        : `Execution wallet balance: ${execBal / LAMPORTS_PER_SOL} SOL`,
    );
  }
  if (anchorPub) {
    console.log(
      anchorBal == null
        ? "Anchor wallet balance: unavailable (RPC error or rate limit)"
        : `Anchor wallet balance: ${anchorBal / LAMPORTS_PER_SOL} SOL`,
    );
  }

  const minLamports = Number(env.SOLANA_MIN_BALANCE_LAMPORTS?.trim() || "10000000");
  const minOk = Number.isFinite(minLamports) && minLamports > 0 ? minLamports : 10_000_000;

  const missing = [];
  if (!env.ZERION_API_KEY?.trim()) missing.push("ZERION_API_KEY");
  if (!env.SOLANA_RPC_URL?.trim()) missing.push("SOLANA_RPC_URL");
  if (!cliEff || !existsFile(cliEff)) missing.push("ZERION_CLI_PATH or bundled scripts/aproof-agent-devnet-execute.mjs");
  if (!execPub) missing.push("ZERION_AGENT_WALLET_ADDRESS or .local/zerion-agent-keypair.json");
  if (!zKpEff || !existsFile(zKpEff)) missing.push("ZERION_AGENT_KEYPAIR_PATH or .local/zerion-agent-keypair.json");
  if (!solKpAbs || !existsFile(solKpAbs)) missing.push("SOLANA_KEYPAIR_PATH");
  if (!anchorGate) missing.push("ANCHOR_MODE/APROOF_ENV solana-devnet");
  if (anchorPub && anchorBal != null && anchorBal < minOk) missing.push(`anchor lamports below ${minOk} (SOLANA_MIN_BALANCE_LAMPORTS)`);

  console.log("");
  if (missing.length === 0) {
    console.log("Zerion live execution readiness: READY");
    console.log("");
    console.log("Restart from aproofDEV root after env edits:");
    console.log("  npm run stop:stack");
    console.log("  npm run dev:stack -- --skip-devnet-smoke");
    console.log("Then hard-refresh the browser and open the Zerion Agent tab.");
  } else {
    console.log("Zerion live execution readiness: NOT READY");
    console.log("Missing or insufficient:");
    for (const m of missing) console.log(`  - ${m}`);
    console.log("");
    console.log("Next actions:");
    if (!existsFile(zKpLocal) && !zKpAbs) console.log("  cd APROOF && npm run zerion:wallet:generate");
    if (!solKpAbs || !existsFile(solKpAbs)) console.log("  cd APROOF && npm run devnet:wallet:bootstrap");
    console.log("  Edit APROOF/.env (never commit it), then restart the stack.");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
