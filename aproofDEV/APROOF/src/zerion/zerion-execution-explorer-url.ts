/**
 * Public Solana explorer URL for a Zerion Agent execution signature (not the AProof anchor tx).
 * Uses the same base URL and cluster convention as devnet anchoring (`SOLANA_EXPLORER_BASE_URL`, `SOLANA_CLUSTER`).
 */
import { buildSolanaExplorerUrl } from "../anchor/solana-devnet-anchor.js";

export function zerionExecutionExplorerUrlFromTxHash(
  txHash: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (txHash == null) return null;
  const t = String(txHash).trim();
  if (t.length < 32) return null;
  const base = env.SOLANA_EXPLORER_BASE_URL?.trim() || "https://explorer.solana.com";
  const cluster = (env.SOLANA_CLUSTER?.trim() || "devnet").toLowerCase();
  return buildSolanaExplorerUrl(t, base, cluster);
}
