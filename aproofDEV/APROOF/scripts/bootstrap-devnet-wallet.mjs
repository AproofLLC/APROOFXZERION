#!/usr/bin/env node
/**
 * Local-only Solana devnet wallet bootstrap: creates an optional gitignored keypair,
 * prints public address + balance, requests airdrops in safe chunks with backoff.
 * Never prints private key bytes to stdout (only writes the JSON keypair file locally).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || clusterApiUrl("devnet");
  if (!process.env.SOLANA_RPC_URL?.trim()) {
    console.warn(
      "[bootstrap] SOLANA_RPC_URL not set; using public devnet RPC (may rate-limit). Prefer a dedicated RPC if you see 429.",
    );
  }

  const minLamports = Number(process.env.SOLANA_MIN_BALANCE_LAMPORTS?.trim() || "10000000");
  const minOk = Number.isFinite(minLamports) && minLamports > 0 ? minLamports : 10_000_000;

  let kpPath = process.env.SOLANA_KEYPAIR_PATH?.trim() ?? "";
  let createdDefault = false;
  if (kpPath) {
    kpPath = isAbsolute(kpPath) ? kpPath : resolve(process.cwd(), kpPath);
    if (!existsSync(kpPath)) {
      console.error("[bootstrap] SOLANA_KEYPAIR_PATH is set but the file does not exist.");
      process.exitCode = 1;
      return;
    }
  } else {
    const abs = resolve(process.cwd(), ".local", "solana-devnet-keypair.json");
    mkdirSync(dirname(abs), { recursive: true });
    const kp = Keypair.generate();
    writeFileSync(abs, JSON.stringify(Array.from(kp.secretKey)), "utf8");
    kpPath = abs;
    createdDefault = true;
    console.log(`[bootstrap] Created local keypair file at ${abs}`);
    console.log("[bootstrap] Set SOLANA_KEYPAIR_PATH to that path in your environment before starting the API.");
  }

  let keypair;
  try {
    const raw = JSON.parse(readFileSync(kpPath, "utf8"));
    if (!Array.isArray(raw) || raw.length !== 64 || raw.some((n) => !Number.isInteger(n))) {
      throw new Error("invalid keypair json");
    }
    keypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  } catch {
    console.error("[bootstrap] Could not read SOLANA_KEYPAIR_PATH as a Solana secret-key byte array JSON.");
    process.exitCode = 1;
    return;
  }

  const pub = keypair.publicKey.toBase58();
  console.log(`[bootstrap] Public wallet address: ${pub}`);

  const connection = new Connection(rpcUrl, "confirmed");
  let balance = 0;
  try {
    balance = await connection.getBalance(keypair.publicKey, "confirmed");
  } catch (e) {
    console.warn("[bootstrap] RPC balance read failed:", e instanceof Error ? e.message : String(e));
    console.log(
      "[bootstrap] Airdrop failed or rate-limited. Fund this public address manually with devnet SOL, then rerun readiness.",
    );
    console.log(
      JSON.stringify({ public_address: pub, balance_lamports: null, faucet_ok: false, wallet_ready: false }),
    );
    return;
  }

  console.log(
    `[bootstrap] Current devnet balance: ${balance} lamports (${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL)`,
  );

  let faucetOk = true;
  const chunk = LAMPORTS_PER_SOL;
  let attempts = 0;
  const maxAirdrops = 12;
  while (balance < minOk && attempts < maxAirdrops) {
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
        const backoff = Math.min(30_000, 1000 * 2 ** (attempts - 1));
        console.warn(`[bootstrap] RPC rate-limited; backing off ${backoff}ms…`);
        await sleep(backoff);
        continue;
      }
      faucetOk = false;
      console.warn("[bootstrap] Airdrop error:", msg);
      break;
    }
  }

  const walletReady = balance >= minOk;
  if (!walletReady) {
    faucetOk = false;
    console.log(
      "[bootstrap] Airdrop failed or rate-limited. Fund this public address manually with devnet SOL, then rerun readiness.",
    );
  }

  console.log(`[bootstrap] Faucet rounds attempted: ${attempts}`);
  console.log(`[bootstrap] Faucet succeeded (reached target): ${walletReady}`);
  console.log(`[bootstrap] Wallet ready (>= min lamports): ${walletReady}`);
  if (createdDefault) {
    console.log(`[bootstrap] Remember: export SOLANA_KEYPAIR_PATH="${kpPath.replace(/\\/g, "\\\\")}"`);
  }
  console.log(
    JSON.stringify({
      public_address: pub,
      balance_lamports: balance,
      balance_sol: balance / LAMPORTS_PER_SOL,
      faucet_ok: faucetOk,
      wallet_ready: walletReady,
      min_lamports: minOk,
    }),
  );

  const execWallet = process.env.ZERION_AGENT_WALLET_ADDRESS?.trim();
  if (execWallet) {
    console.log(`[bootstrap] Zerion Agent execution wallet (public): ${execWallet}`);
    console.log(
      "[bootstrap] If this address is not the same as the anchor wallet above, fund it separately with devnet SOL for live Authorized Execution.",
    );
  } else {
    console.log(
      "[bootstrap] Set ZERION_AGENT_WALLET_ADDRESS to the public address controlled by your forked Zerion Agent, then fund that address on devnet.",
    );
  }
}

main().catch((e) => {
  console.error("[bootstrap] Fatal:", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
