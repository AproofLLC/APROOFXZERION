/** Client-side devnet execution tx explorer (Zerion); anchor proofs use `anchor_explorer_url` from the API. */
export function zerionExecutionExplorerUrlFromTxHash(txHash: string | null | undefined): string | null {
  if (txHash == null) return null;
  const t = String(txHash).trim();
  if (t.length < 32) return null;
  return `https://explorer.solana.com/tx/${t}?cluster=devnet`;
}
