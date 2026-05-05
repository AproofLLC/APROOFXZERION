import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { anchorBatchItems, anchorBatches, canonicalEvents, proofUnits } from "../db/schema/index.js";
import { mvpAnchorBatchHashes, proofDigest } from "../protocol/anchor-batch-hash.js";
import { normalizeAnchorMetadata } from "./anchor-metadata-normalizer.js";

export type ProofVerificationStatus = "valid" | "invalid" | "not_anchored" | "error";

export type ProofVerificationResponse = {
  proof_id: string;
  subject_id: string | null;
  event_id: string | null;
  batch_id: string | null;
  verification_status: ProofVerificationStatus;
  computed_root_hash: string | null;
  anchored_root_hash: string | null;
  proof_digest: string | null;
  tx_signature: string | null;
  explorer_url: string | null;
  network: string | null;
  anchor_status: string | null;
  verified_at: string;
  mismatch_reason: string | null;
  error_message: string | null;
};

function baseResponse(input: {
  proofId: string;
  subjectId: string | null;
  eventId: string | null;
  batchId: string | null;
}): ProofVerificationResponse {
  return {
    proof_id: input.proofId,
    subject_id: input.subjectId,
    event_id: input.eventId,
    batch_id: input.batchId,
    verification_status: "error",
    computed_root_hash: null,
    anchored_root_hash: null,
    proof_digest: null,
    tx_signature: null,
    explorer_url: null,
    network: null,
    anchor_status: null,
    verified_at: new Date().toISOString(),
    mismatch_reason: null,
    error_message: null,
  };
}

export async function verifyStoredProofById(
  db: Db,
  params: { proofId: string; organizationId: string; environmentId: string },
): Promise<ProofVerificationResponse | null> {
  const [proof] = await db
    .select({
      proofId: proofUnits.proofId,
      subjectId: proofUnits.subjectId,
      eventId: proofUnits.eventId,
      batchId: proofUnits.anchorBatchId,
      angle: proofUnits.angle,
      status: proofUnits.status,
      deltaCode: proofUnits.deltaCode,
    })
    .from(proofUnits)
    .innerJoin(canonicalEvents, eq(canonicalEvents.eventId, proofUnits.eventId))
    .where(
      and(
        eq(proofUnits.proofId, params.proofId),
        eq(canonicalEvents.organizationId, params.organizationId),
        eq(canonicalEvents.environmentId, params.environmentId),
      ),
    )
    .limit(1);
  if (!proof) return null;

  const response = baseResponse({
    proofId: proof.proofId,
    subjectId: proof.subjectId,
    eventId: proof.eventId,
    batchId: proof.batchId,
  });

  try {
    response.proof_digest = proofDigest({
      proof_id: proof.proofId,
      angle: proof.angle,
      status: proof.status,
      delta_code: proof.deltaCode,
    });
  } catch {
    response.verification_status = "error";
    response.error_message = "PROOF_DIGEST_RECOMPUTE_FAILED";
    return response;
  }

  if (!proof.batchId) {
    response.verification_status = "not_anchored";
    response.mismatch_reason = "NO_ANCHOR_FOUND";
    return response;
  }

  const [batch] = await db
    .select({
      id: anchorBatches.id,
      rootHash: anchorBatches.rootHash,
      txSignature: anchorBatches.txSignature,
      txRef: anchorBatches.txRef,
      explorerUrl: anchorBatches.explorerUrl,
      chainName: anchorBatches.chainName,
      cluster: anchorBatches.cluster,
      anchorMode: anchorBatches.anchorMode,
      confirmationStatus: anchorBatches.confirmationStatus,
      anchoredAt: anchorBatches.anchoredAt,
      createdAt: anchorBatches.createdAt,
      errorMessage: anchorBatches.errorMessage,
      status: anchorBatches.status,
    })
    .from(anchorBatches)
    .where(eq(anchorBatches.id, proof.batchId))
    .limit(1);

  if (!batch || !batch.rootHash) {
    response.verification_status = "not_anchored";
    response.mismatch_reason = "NO_ANCHOR_FOUND";
    return response;
  }

  const canonicalAnchor = normalizeAnchorMetadata({
    batch_id: batch.id,
    root_hash: batch.rootHash,
    tx_signature: batch.txSignature ?? batch.txRef,
    explorer_url: batch.explorerUrl,
    network: batch.chainName,
    cluster: batch.cluster,
    anchor_mode: batch.anchorMode,
    confirmation_status: batch.confirmationStatus,
    anchored_at: batch.anchoredAt?.toISOString() ?? null,
    created_at: batch.createdAt.toISOString(),
    error_message: batch.errorMessage,
  });
  response.anchored_root_hash = canonicalAnchor.root_hash;
  response.tx_signature = canonicalAnchor.tx_signature;
  /**
   * Must match `applyPersistedAnchorToProductProof` / `product_proof.anchor_explorer_url`: that path copies
   * `anchor_batches.explorer_url` directly. `normalizeAnchorMetadata` can drop `explorer_url` when its derived
   * `anchor_mode` does not classify the row as Solana devnet (legacy / inconsistent `anchorMode` or `chainName`),
   * which previously made GET `/proofs/:id/verification` disagree with the proof envelope for the same batch row.
   */
  const persistedExplorerUrl =
    batch.explorerUrl != null && String(batch.explorerUrl).trim() !== ""
      ? String(batch.explorerUrl).trim()
      : null;
  response.explorer_url = persistedExplorerUrl ?? canonicalAnchor.explorer_url;
  response.network = canonicalAnchor.network;
  response.anchor_status = canonicalAnchor.status;

  try {
    const rows = await db
      .select({
        proofId: proofUnits.proofId,
        angle: proofUnits.angle,
        status: proofUnits.status,
        deltaCode: proofUnits.deltaCode,
      })
      .from(anchorBatchItems)
      .innerJoin(proofUnits, eq(proofUnits.proofId, anchorBatchItems.proofId))
      .where(eq(anchorBatchItems.batchId, proof.batchId))
      .orderBy(asc(anchorBatchItems.ordinal));

    if (rows.length === 0) {
      response.verification_status = "error";
      response.error_message = "BATCH_RECOMPUTE_INPUT_MISSING";
      return response;
    }

    const orderedDigests = rows.map((row) =>
      proofDigest({
        proof_id: row.proofId,
        angle: row.angle,
        status: row.status,
        delta_code: row.deltaCode,
      }),
    );
    response.computed_root_hash = mvpAnchorBatchHashes(orderedDigests).rootHash;
  } catch {
    response.verification_status = "error";
    response.error_message = "BATCH_ROOT_RECOMPUTE_FAILED";
    return response;
  }

  if (!response.computed_root_hash || !response.anchored_root_hash) {
    response.verification_status = "not_anchored";
    response.mismatch_reason = "NO_ANCHOR_FOUND";
    return response;
  }

  if (response.computed_root_hash === response.anchored_root_hash) {
    response.verification_status = "valid";
    return response;
  }

  response.verification_status = "invalid";
  response.mismatch_reason = "ROOT_HASH_MISMATCH";
  return response;
}
