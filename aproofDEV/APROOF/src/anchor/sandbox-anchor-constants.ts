/**
 * Solana-oriented sandbox route: a contained, Solana-shaped attestation path over the same local
 * proof → digest → batch → `anchor_payload` → persistence pipeline as a future real Solana devnet
 * writer. The current path does not perform external chain submission; only the attestation writer
 * implementation changes when devnet is enabled.
 */

/** Persisted `anchor_batches.chain_name` and product `anchor_chain` for this environment. */
export const SOLANA_SANDBOX_ROUTE = "solana-sandbox" as const;

export const SOLANA_CHAIN_FAMILY = "solana" as const;

/** Honest local cluster label — not a live Solana cluster RPC target in sandbox mode. */
export const SOLANA_SANDBOX_CLUSTER = "sandbox-devnet" as const;

/** Deterministic batch commitment string (no external attestation in sandbox). */
export function formatSandboxAnchorPayload(batchHash: string): string {
  return `aproof:v1:${batchHash}`;
}

export const SANDBOX_ANCHOR_PROTOCOL_VERSION = "v1" as const;

/** Max proof units (per digest line) in one batch before single-proof fallback for the remainder. */
export const SANDBOX_ANCHOR_BATCH_MAX_UNITS = 2;
