import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const SOLANA_MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const ANCHOR_DEBUG = process.env.APROOF_ANCHOR_DEBUG === "1";

export type AnchorMode = "solana-devnet" | "sandbox-mock";
export type ResolvedAnchorMode = "solana-devnet" | "sandbox" | "mock" | "disabled";

export type SolanaAnchorResult = {
  tx_signature: string;
  wallet_public_key: string;
  confirmation_status: string;
  explorer_url: string;
  anchored_at: string;
  memo_payload: Record<string, unknown>;
};

export type SolanaDevnetConfig = {
  rpcUrl: string;
  cluster: string;
  keypairPath: string;
  keypairPathAbsolute: string;
  explorerBaseUrl: string;
  autoCreateDevnetWallet: boolean;
  autoAirdropDevnet: boolean;
  minBalanceLamports: number;
};

export function resolveAnchorMode(env: NodeJS.ProcessEnv = process.env): ResolvedAnchorMode {
  const raw = env.ANCHOR_MODE?.trim().toLowerCase();
  if (raw === "solana-devnet") return "solana-devnet";
  if (!raw || raw === "mock") return "mock";
  if (raw === "sandbox") return "sandbox";
  if (raw === "disabled" || raw === "off" || raw === "none") return "disabled";
  return "mock";
}

export function resolveSolanaDevnetConfig(env: NodeJS.ProcessEnv = process.env): SolanaDevnetConfig {
  const rpcUrl = env.SOLANA_RPC_URL?.trim() || clusterApiUrl("devnet");
  const cluster = env.SOLANA_CLUSTER?.trim() || "devnet";
  const autoCreateDevnetWallet = env.SOLANA_AUTOCREATE_DEVNET_WALLET?.trim().toLowerCase() === "true";
  const autoAirdropDevnet = env.SOLANA_AUTO_AIRDROP_DEVNET?.trim().toLowerCase() === "true";
  const minBalanceLamports = Number(env.SOLANA_MIN_BALANCE_LAMPORTS?.trim() || "10000000");
  const keypairPath =
    env.SOLANA_KEYPAIR_PATH?.trim() ||
    (autoCreateDevnetWallet ? ".local/solana/anchor-devnet.json" : "");
  const keypairPathAbsolute = path.resolve(process.cwd(), keypairPath);
  const explorerBaseUrl = env.SOLANA_EXPLORER_BASE_URL?.trim() || "https://explorer.solana.com";
  if (cluster !== "devnet") {
    throw new Error("SOLANA_CONFIG_INVALID: SOLANA_CLUSTER must be devnet.");
  }
  if (!rpcUrl) {
    throw new Error("SOLANA_CONFIG_INVALID: SOLANA_RPC_URL is required.");
  }
  if (!keypairPath) {
    throw new Error("SOLANA_CONFIG_INVALID: SOLANA_KEYPAIR_PATH is required when ANCHOR_MODE=solana-devnet.");
  }
  if (!autoCreateDevnetWallet && !existsSync(keypairPathAbsolute)) {
    throw new Error("SOLANA_CONFIG_INVALID: SOLANA_KEYPAIR_PATH file does not exist.");
  }
  if (!Number.isFinite(minBalanceLamports) || minBalanceLamports <= 0) {
    throw new Error("SOLANA_CONFIG_INVALID: SOLANA_MIN_BALANCE_LAMPORTS must be a positive number.");
  }
  return {
    rpcUrl,
    cluster,
    keypairPath,
    keypairPathAbsolute,
    explorerBaseUrl,
    autoCreateDevnetWallet,
    autoAirdropDevnet,
    minBalanceLamports,
  };
}

export async function loadAnchorKeypairFromPath(keypairPath: string): Promise<Keypair> {
  let raw: string;
  try {
    raw = await readFile(keypairPath, "utf8");
  } catch {
    throw new Error("SOLANA_DEVNET_KEYPAIR_INVALID");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("SOLANA_DEVNET_KEYPAIR_INVALID");
  }
  if (!Array.isArray(parsed) || parsed.length !== 64 || parsed.some((n) => !Number.isInteger(n))) {
    throw new Error("SOLANA_DEVNET_KEYPAIR_INVALID");
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
}

export async function loadOrCreateAnchorKeypair(config: SolanaDevnetConfig): Promise<Keypair> {
  if (existsSync(config.keypairPathAbsolute)) {
    return loadAnchorKeypairFromPath(config.keypairPathAbsolute);
  }
  if (!config.autoCreateDevnetWallet) {
    throw new Error("SOLANA_DEVNET_KEYPAIR_INVALID");
  }
  const keypair = Keypair.generate();
  await mkdir(path.dirname(config.keypairPathAbsolute), { recursive: true });
  await writeFile(config.keypairPathAbsolute, JSON.stringify(Array.from(keypair.secretKey)), "utf8");
  try {
    await chmod(config.keypairPathAbsolute, 0o600);
  } catch {
    // Best effort on Windows and non-POSIX filesystems.
  }
  console.info(`[anchor] Created devnet wallet at: ${config.keypairPathAbsolute}`);
  console.info(`[anchor] Wallet public key: ${keypair.publicKey.toBase58()}`);
  return keypair;
}

export function buildCanonicalMemoPayload(params: {
  rootHash: string;
  proofCount: number;
  createdAtIso: string;
}): Record<string, unknown> {
  return {
    protocol: "aproof",
    anchor_version: "solana-devnet-v1",
    root_hash: params.rootHash,
    proof_count: params.proofCount,
    subject_scope: "sandbox",
    created_at: params.createdAtIso,
  };
}

export function buildSolanaExplorerUrl(signature: string, explorerBaseUrl: string, cluster: string): string {
  const suffix = cluster === "devnet" ? "?cluster=devnet" : "";
  return `${explorerBaseUrl.replace(/\/+$/, "")}/tx/${signature}${suffix}`;
}

export async function getWalletBalanceLamports(connection: Connection, keypair: Keypair): Promise<number> {
  return connection.getBalance(keypair.publicKey, "confirmed");
}

export async function ensureDevnetBalanceLamports(
  connection: Pick<Connection, "getBalance" | "requestAirdrop" | "confirmTransaction">,
  keypair: Keypair,
  config: SolanaDevnetConfig,
): Promise<number> {
  let balance: number;
  try {
    balance = await connection.getBalance(keypair.publicKey, "confirmed");
  } catch {
    throw new Error("SOLANA_DEVNET_RPC_UNAVAILABLE");
  }
  if (balance >= config.minBalanceLamports) return balance;
  if (!config.autoAirdropDevnet) {
    throw new Error("SOLANA_DEVNET_WALLET_UNFUNDED");
  }
  let sig: string;
  try {
    sig = await connection.requestAirdrop(keypair.publicKey, 1 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|rate|too many|fetch failed/i.test(msg)) {
      throw new Error("SOLANA_DEVNET_RPC_UNAVAILABLE");
    }
    throw new Error("SOLANA_DEVNET_ANCHOR_FAILED");
  }
  let recheckedBalance: number;
  try {
    recheckedBalance = await connection.getBalance(keypair.publicKey, "confirmed");
  } catch {
    throw new Error("SOLANA_DEVNET_RPC_UNAVAILABLE");
  }
  if (recheckedBalance < config.minBalanceLamports) {
    throw new Error("SOLANA_DEVNET_WALLET_UNFUNDED");
  }
  return recheckedBalance;
}

export async function submitSolanaDevnetMemo(params: {
  config: SolanaDevnetConfig;
  rootHash: string;
  proofCount: number;
  createdAtIso: string;
}): Promise<SolanaAnchorResult> {
  const keypair = await loadOrCreateAnchorKeypair(params.config);
  if (ANCHOR_DEBUG) {
    console.info(`[anchor] Loaded wallet: ${keypair.publicKey.toBase58()}`);
    console.info(`[anchor] Connecting to: ${params.config.rpcUrl}`);
  }
  let connection: Connection;
  try {
    connection = new Connection(params.config.rpcUrl, "confirmed");
  } catch {
    throw new Error("SOLANA_DEVNET_RPC_UNAVAILABLE");
  }
  await ensureDevnetBalanceLamports(connection, keypair, params.config);
  const memoPayload = buildCanonicalMemoPayload(params);
  if (ANCHOR_DEBUG) {
    console.info(`[anchor] Submitting Solana Devnet anchor for root: ${params.rootHash}`);
  }
  const memoData = Buffer.from(JSON.stringify(memoPayload), "utf8");
  const memoInstruction = new TransactionInstruction({
    programId: SOLANA_MEMO_PROGRAM_ID,
    keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: false }],
    data: memoData,
  });
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: keypair.publicKey,
      lamports: 0 * LAMPORTS_PER_SOL,
    }),
    memoInstruction,
  );
  let signature: string;
  try {
    signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {
      commitment: "confirmed",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|rate|too many|fetch failed|timeout/i.test(msg)) {
      throw new Error("SOLANA_DEVNET_RPC_UNAVAILABLE");
    }
    throw new Error("SOLANA_DEVNET_ANCHOR_FAILED");
  }
  if (!signature) {
    throw new Error("SOLANA_DEVNET_SIGNATURE_MISSING");
  }
  const confirmation_status = "confirmed";
  if (ANCHOR_DEBUG) {
    console.info(`[anchor] TX SIGNATURE: ${signature}`);
  }
  return {
    tx_signature: signature,
    wallet_public_key: keypair.publicKey.toBase58(),
    confirmation_status,
    explorer_url: buildSolanaExplorerUrl(signature, params.config.explorerBaseUrl, params.config.cluster),
    anchored_at: new Date().toISOString(),
    memo_payload: memoPayload,
  };
}
