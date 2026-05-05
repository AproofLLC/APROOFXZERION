import { createHash } from "node:crypto";
import {
  formatSandboxAnchorPayload,
  SOLANA_CHAIN_FAMILY,
  SOLANA_SANDBOX_ROUTE,
} from "./sandbox-anchor-constants.js";

const SIG_SANDBOX_V1 = Buffer.from("aproof:solana-sim:sig:v1\0", "utf8");
const SLOT_SANDBOX_V1 = Buffer.from("aproof:solana-sim:slot:v1\0", "utf8");

/**
 * Deterministic, clearly sandbox-tagged “signature” shape derived from the batch commitment hash.
 * Not a chain Ed25519 signature — prefix makes simulation explicit for humans and for UI.
 */
export function simulatedSignatureFromBatchHash(batchHash: string): string {
  const digest = createHash("sha256");
  digest.update(SIG_SANDBOX_V1);
  digest.update(batchHash, "utf8");
  return `ssim1_${digest.digest("hex")}`;
}

/**
 * Plausible u64 slot range as a decimal string, stable for a given batch hash.
 * Offset keeps values in a Solana-like magnitude band without claiming a real cluster slot.
 */
export function simulatedSlotFromBatchHash(batchHash: string): string {
  const d = createHash("sha256");
  d.update(SLOT_SANDBOX_V1);
  d.update(batchHash, "utf8");
  const buf = d.digest();
  const lo = buf.readUInt32BE(0);
  const hi = buf.readUInt32BE(4);
  const n = (BigInt(hi) << 32n) | BigInt(lo);
  const slot = 200_000_000_000n + (n % 99_000_000_000n);
  return slot.toString();
}

export type SolanaSandboxAttestation = {
  route: typeof SOLANA_SANDBOX_ROUTE;
  chain_family: typeof SOLANA_CHAIN_FAMILY;
  cluster: string;
  batch_hash: string;
  anchor_payload: string | null;
  simulated_signature: string;
  simulated_slot: string;
  simulated_commitment: string;
  external_attested: false;
};

/** Local sandbox finalization of the batch record — not external chain `finalized` consensus. */
export const SIMULATED_COMMITMENT_SANDBOX_FINALIZED = "simulated_finalized" as const;

/**
 * Build the Solana-shaped sandbox attestation for API/product proof.
 * Fills missing simulated fields from `batchHash` (same values as at coordinator insert time).
 */
export function buildSolanaSandboxAttestationForBatch(
  row: {
    chainName: string;
    batchHash: string;
    anchorPayload: string | null;
    chainFamily: string;
    cluster: string;
    simulatedSignature: string | null;
    simulatedSlot: string | null;
    simulatedCommitment: string;
    externalAttested: boolean;
  },
): SolanaSandboxAttestation | null {
  if (row.chainName !== SOLANA_SANDBOX_ROUTE) return null;
  return {
    route: SOLANA_SANDBOX_ROUTE,
    chain_family: SOLANA_CHAIN_FAMILY,
    cluster: row.cluster,
    batch_hash: row.batchHash,
    anchor_payload: row.anchorPayload,
    simulated_signature:
      row.simulatedSignature ?? simulatedSignatureFromBatchHash(row.batchHash),
    simulated_slot: row.simulatedSlot ?? simulatedSlotFromBatchHash(row.batchHash),
    simulated_commitment: row.simulatedCommitment,
    /** Always false for this route until a real attestation writer is wired (swap-in only at writer boundary). */
    external_attested: false,
  };
}

/**
 * Alias: same `formatSandboxAnchorPayload` commitment string `aproof:v1:<batch_hash>`.
 */
export const formatAproofV1AnchorPayload = formatSandboxAnchorPayload;
