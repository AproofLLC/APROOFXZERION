#!/usr/bin/env node
/**
 * Real Solana devnet micro-transfer for the Zerion CLI argv contract used by AProof.
 *
 * - Intended to be referenced by ZERION_CLI_PATH (or copied to ../zerion-ai/scripts/aproof-agent-execute.mjs).
 * - Requires ZERION_API_KEY (presence only; never printed).
 * - Requires ZERION_AGENT_KEYPAIR_PATH: JSON byte array keypair whose pubkey must match --wallet.
 * - Sends a tiny SOL transfer on devnet (reliable vs swap); returns JSON only on stdout.
 *
 * Never prints private keys or API key values.
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aproofRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(aproofRoot, ".env") });

function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function fail(message) {
  emit({ ok: false, runtime_error: "ZERION_CLI_EXECUTION_FAILED", message });
  process.exitCode = 1;
}

function parseArgv(argv) {
  const o = { flags: new Set() };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.flags.add("json");
    else if (a === "--mode") o.mode = argv[++i];
    else if (a === "--chain") o.chain = argv[++i];
    else if (a === "--asset") o.asset = argv[++i];
    else if (a === "--amount-usd") o.amountUsd = argv[++i];
    else if (a === "--wallet") o.wallet = argv[++i];
    else if (a === "--recipient") o.recipient = argv[++i];
  }
  return o;
}

function debugRecipient(stage, value) {
  if (process.env.APROOF_DEBUG_ZERION_RECIPIENT === "1") {
    process.stderr.write(`[zerion-recipient] stage=${stage} recipient=${value || "null"}\n`);
  }
}

async function loadWeb3() {
  try {
    return await import("@solana/web3.js");
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgv(process.argv);
  if (args.mode !== "execute") {
    fail("mode must be execute");
    return;
  }
  if (!args.flags.has("json")) {
    fail("--json is required");
    return;
  }
  if ((args.chain ?? "").trim() !== "solana-devnet") {
    fail("only --chain solana-devnet is supported");
    return;
  }
  const asset = (args.asset ?? "").trim().toUpperCase();
  if (asset !== "SOL") {
    fail("only --asset SOL is supported for this reference executor");
    return;
  }
  const walletArg = (args.wallet ?? "").trim();
  if (!walletArg) {
    fail("--wallet is required");
    return;
  }
  if (!process.env.ZERION_API_KEY?.trim()) {
    fail("ZERION_API_KEY must be set in the environment");
    return;
  }

  const kpPath = process.env.ZERION_AGENT_KEYPAIR_PATH?.trim();
  if (!kpPath) {
    fail("ZERION_AGENT_KEYPAIR_PATH must point to the execution wallet keypair JSON (gitignored)");
    return;
  }
  const rpcUrl = process.env.SOLANA_RPC_URL?.trim();
  if (!rpcUrl) {
    fail("SOLANA_RPC_URL must be set");
    return;
  }

  const web3 = await loadWeb3();
  if (!web3) {
    fail("@solana/web3.js is not installed (run npm install in this repo or your fork)");
    return;
  }

  const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = web3;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(kpPath, "utf8"));
  } catch {
    fail("could not read ZERION_AGENT_KEYPAIR_PATH as JSON");
    return;
  }
  if (!Array.isArray(raw) || raw.length !== 64 || raw.some((n) => !Number.isInteger(n))) {
    fail("ZERION_AGENT_KEYPAIR_PATH must be a 64-number secret key JSON array");
    return;
  }
  let signer;
  try {
    signer = Keypair.fromSecretKey(Uint8Array.from(raw));
  } catch {
    fail("invalid keypair bytes");
    return;
  }
  const pub = signer.publicKey.toBase58();
  if (pub !== walletArg) {
    fail("--wallet must match the public key derived from ZERION_AGENT_KEYPAIR_PATH");
    return;
  }

  const connection = new Connection(rpcUrl, "confirmed");
  /**
   * Transfer enough lamports to a fresh pubkey to satisfy rent-exemption for a 0-byte system account.
   * A few thousand lamports fails simulation with "insufficient funds for rent" on devnet/mainnet.
   */
  let lamports;
  try {
    lamports = await connection.getMinimumBalanceForRentExemption(0);
  } catch {
    lamports = 890_880;
  }
  /** Extra headroom for base transaction fee (varies by congestion). */
  const feeBuffer = 15_000;
  const bal = await connection.getBalance(signer.publicKey, "confirmed");
  if (bal < lamports + feeBuffer) {
    fail("execution wallet balance too low for this transfer; fund devnet SOL and retry");
    return;
  }

  const recipientArg = (args.recipient ?? "").trim();
  if (!recipientArg) {
    fail("--recipient is required for deterministic execution continuity");
    return;
  }
  let dest;
  try {
    dest = new PublicKey(recipientArg);
  } catch {
    fail("--recipient must be a valid Solana public key");
    return;
  }
  if (recipientArg !== dest.toBase58()) {
    fail("--recipient must be a canonical Solana public key");
    return;
  }
  debugRecipient("executor_chosen", dest.toBase58());
  const ix = SystemProgram.transfer({
    fromPubkey: signer.publicKey,
    toPubkey: dest,
    lamports,
  });
  const tx = new Transaction().add(ix);
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
      commitment: "confirmed",
      skipPreflight: false,
    });
    const outboundRecipient = dest.toBase58();
    if (outboundRecipient !== recipientArg) {
      fail("transfer recipient must equal --recipient (deterministic route violation)");
      return;
    }
    const amountUsd = Number(args.amountUsd);
    emit({
      ok: true,
      tx_hash: sig,
      chain: "solana-devnet",
      asset: "SOL",
      amount_usd: Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : 1,
      wallet_address: pub,
      recipient_address: dest.toBase58(),
      execution_source: "zerion_cli",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(msg.length > 200 ? `${msg.slice(0, 197)}…` : msg);
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  emit({ ok: false, runtime_error: "ZERION_CLI_EXECUTION_FAILED", message: msg.length > 200 ? `${msg.slice(0, 197)}…` : msg });
  process.exitCode = 1;
});
