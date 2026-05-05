import { createHash } from "node:crypto";

/**
 * MVP anchor rule: root_hash = batch_hash.
 * batch_hash = SHA256(ordered proof_digest list), UTF-8 newline-separated hex digests (deterministic, order-preserving).
 *
 * proof_digest (spec §12) = SHA256(canonical JSON object { proof_id, angle, status, delta_code })
 * with sorted object keys and JSON null for absent delta_code.
 */

const encoder = new TextEncoder();

export function sha256HexUtf8(payload: string): string {
  return createHash("sha256").update(encoder.encode(payload)).digest("hex");
}

/** Sorted keys, deterministic JSON for hashing (no floats). */
export function canonicalJsonForProofDigest(input: {
  proof_id: string;
  angle: string;
  status: string;
  delta_code: string | null;
}): string {
  const ordered: Record<string, string | null> = {
    angle: input.angle,
    delta_code: input.delta_code,
    proof_id: input.proof_id,
    status: input.status,
  };
  return JSON.stringify(ordered);
}

export function proofDigest(input: {
  proof_id: string;
  angle: string;
  status: string;
  delta_code: string | null;
}): string {
  return sha256HexUtf8(canonicalJsonForProofDigest(input));
}

/** One proof_digest per line, in batch order; input is hex strings from proofDigest(). */
export function batchHashFromOrderedProofDigests(orderedHexDigests: readonly string[]): string {
  return sha256HexUtf8(orderedHexDigests.join("\n"));
}

/** MVP: persist both fields to this result when creating anchor_batches rows. */
export function mvpAnchorBatchHashes(orderedHexDigests: readonly string[]): {
  batchHash: string;
  rootHash: string;
} {
  const batchHash = batchHashFromOrderedProofDigests(orderedHexDigests);
  return { batchHash, rootHash: batchHash };
}
