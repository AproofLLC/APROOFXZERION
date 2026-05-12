#!/usr/bin/env node
/**
 * Generate a local Solana devnet keypair for Zerion Agent execution, persist under .local/,
 * print public address + path + balance only (never secret bytes or mnemonic).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OUT_REL = ".local/zerion-agent-keypair.json";
const MIN_SOL = 0.05;

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, "..");
  const outAbs = resolve(repoRoot, OUT_REL);
  mkdirSync(dirname(outAbs), { recursive: true });

  const keypair = Keypair.generate();
  writeFileSync(outAbs, JSON.stringify(Array.from(keypair.secretKey)), "utf8");

  const pub = keypair.publicKey.toBase58();
  const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || clusterApiUrl("devnet");
  if (!process.env.SOLANA_RPC_URL?.trim()) {
    console.warn(
      "[zerion:wallet] SOLANA_RPC_URL not set; using public devnet RPC (may rate-limit). Prefer a dedicated RPC if you see 429.",
    );
  }

  const connection = new Connection(rpcUrl, "confirmed");
  let balance = 0;
  try {
    balance = await connection.getBalance(keypair.publicKey, "confirmed");
  } catch (e) {
    console.log("Zerion Agent wallet generated.");
    console.log("Public address:");
    console.log(pub);
    console.log("");
    console.log("Keypair saved:");
    console.log(OUT_REL);
    console.log("");
    console.log("Devnet balance:");
    console.log("— (RPC unavailable)");
    console.log("");
    console.log("Faucet result:");
    console.log("Skipped — could not reach RPC (no balance check or airdrop attempted).");
    console.log("");
    console.log("Copy these into your local .env:");
    console.log(`ZERION_AGENT_WALLET_ADDRESS=${pub}`);
    console.log(`ZERION_AGENT_KEYPAIR_PATH=${outAbs}`);
    console.log("");
    console.log("Airdrop failed or rate-limited. Fund this public address manually with devnet SOL.");
    return;
  }

  const minLamports = Math.floor(MIN_SOL * LAMPORTS_PER_SOL);
  let faucetOk = true;
  let attempts = 0;
  const maxAirdrops = 20;
  const chunk = LAMPORTS_PER_SOL;

  while (balance < minLamports && attempts < maxAirdrops) {
    attempts += 1;
    try {
      const sig = await connection.requestAirdrop(keypair.publicKey, chunk);
      const latest = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        { blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight, signature: sig },
        "confirmed",
      );
      balance = await connection.getBalance(keypair.publicKey, "confirmed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const is429 = /429|rate|too many/i.test(msg);
      if (is429) {
        const backoff = Math.min(30_000, 1000 * 2 ** Math.min(attempts - 1, 8));
        console.warn(`[zerion:wallet] RPC rate-limited; backing off ${backoff}ms…`);
        await sleep(backoff);
        continue;
      }
      faucetOk = false;
      console.warn("[zerion:wallet] Airdrop error:", msg);
      break;
    }
  }

  const sol = balance / LAMPORTS_PER_SOL;
  console.log("Zerion Agent wallet generated.");
  console.log("Public address:");
  console.log(pub);
  console.log("");
  console.log("Keypair saved:");
  console.log(OUT_REL);
  console.log("");
  console.log("Devnet balance:");
  console.log(`${sol} SOL`);
  console.log("");
  console.log("Faucet result:");
  console.log(faucetOk && balance >= minLamports ? "Funded to at least 0.05 SOL (or already sufficient)." : "Incomplete — see message below if manual funding is required.");
  console.log("");
  console.log("Copy these into your local .env:");
  console.log(`ZERION_AGENT_WALLET_ADDRESS=${pub}`);
  console.log(`ZERION_AGENT_KEYPAIR_PATH=${outAbs}`);
  console.log("");

  if (!faucetOk || balance < minLamports) {
    console.log("Airdrop failed or rate-limited. Fund this public address manually with devnet SOL.");
  }
}

main().catch((e) => {
  console.error("[zerion:wallet] Fatal:", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
