/**
 * Resolve Zerion Agent devnet execution defaults from the repo working tree.
 * Never logs or returns secret key material — only paths and derived pubkeys.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

export const LOCAL_ZERION_AGENT_KEYPAIR_REL = ".local/zerion-agent-keypair.json";

export function safeStatIsFile(absPath: string): boolean {
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
}

export function resolveLocalZerionAgentKeypairAbs(cwd: string = process.cwd()): string {
  return path.resolve(cwd, LOCAL_ZERION_AGENT_KEYPAIR_REL);
}

/**
 * Reads a Solana CLI-style JSON keypair array and returns the public address only.
 */
export function readPubkeyFromZerionKeypairFile(absPath: string): string | null {
  try {
    const raw = JSON.parse(readFileSync(absPath, "utf8")) as unknown;
    if (!Array.isArray(raw) || raw.length !== 64 || raw.some((n) => !Number.isInteger(n))) return null;
    return Keypair.fromSecretKey(Uint8Array.from(raw as number[])).publicKey.toBase58();
  } catch {
    return null;
  }
}

export function resolveDefaultZerionCliPath(cwd: string = process.cwd()): string | null {
  const p = path.resolve(cwd, "scripts", "aproof-agent-devnet-execute.mjs");
  return safeStatIsFile(p) ? p : null;
}

export function isBundledAproofDevnetExecutorPath(cliPath: string): boolean {
  return cliPath.replace(/\\/g, "/").toLowerCase().includes("aproof-agent-devnet-execute");
}

export function effectiveZerionAgentWallet(env: NodeJS.ProcessEnv, cwd: string = process.cwd()): string {
  const w = env.ZERION_AGENT_WALLET_ADDRESS?.trim();
  if (w) return w;
  const abs = resolveLocalZerionAgentKeypairAbs(cwd);
  if (!safeStatIsFile(abs)) return "";
  return readPubkeyFromZerionKeypairFile(abs) ?? "";
}

export function effectiveZerionAgentKeypairPath(env: NodeJS.ProcessEnv, cwd: string = process.cwd()): string {
  const k = env.ZERION_AGENT_KEYPAIR_PATH?.trim();
  if (k) {
    const abs = path.isAbsolute(k) ? k : path.resolve(cwd, k);
    return safeStatIsFile(abs) ? abs : "";
  }
  const def = resolveLocalZerionAgentKeypairAbs(cwd);
  return safeStatIsFile(def) ? def : "";
}

export function effectiveZerionCliPath(env: NodeJS.ProcessEnv, cwd: string = process.cwd()): string {
  const c = env.ZERION_CLI_PATH?.trim();
  if (c) {
    const abs = path.isAbsolute(c) ? c : path.resolve(cwd, c);
    return abs;
  }
  return resolveDefaultZerionCliPath(cwd) ?? "";
}
