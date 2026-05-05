import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { anchorBatches, proofUnits } from "../db/schema/index.js";
import { buildSolanaSandboxAttestationForBatch } from "../anchor/solana-simulated-attestation.js";
import type { AnchorStatus, ProductProof } from "../product/product-proof.js";

/**
 * Binds the in-memory `product_proof` to persisted anchor rows so POST/GET reflect the data plane
 * the proof engine and sandbox coordinator actually wrote.
 */
export async function applyPersistedAnchorToProductProof(
  db: Db,
  eventId: string,
  productProof: ProductProof,
): Promise<void> {
  const units = await db
    .select({
      proofId: proofUnits.proofId,
      anchorState: proofUnits.anchorState,
      anchorBatchId: proofUnits.anchorBatchId,
    })
    .from(proofUnits)
    .where(eq(proofUnits.eventId, eventId));

  if (units.length === 0) return;

  /** Batch linked to the primary proof row (same id as `product_proof.proof_id` / verification lookup). */
  const primaryBatchId =
    units.find((u) => u.proofId === productProof.proof_id)?.anchorBatchId ?? null;

  const batchIds = [
    ...new Set(units.map((u) => u.anchorBatchId).filter((x): x is string => x !== null)),
  ];

  const batchSelect = {
    id: anchorBatches.id,
    chainName: anchorBatches.chainName,
    chainFamily: anchorBatches.chainFamily,
    cluster: anchorBatches.cluster,
    batchHash: anchorBatches.batchHash,
    anchorPayload: anchorBatches.anchorPayload,
    txRef: anchorBatches.txRef,
    txSignature: anchorBatches.txSignature,
    explorerUrl: anchorBatches.explorerUrl,
    walletPublicKey: anchorBatches.walletPublicKey,
    confirmationStatus: anchorBatches.confirmationStatus,
    errorMessage: anchorBatches.errorMessage,
    rootHash: anchorBatches.rootHash,
    proofCount: anchorBatches.proofCount,
    anchorMode: anchorBatches.anchorMode,
    createdAt: anchorBatches.createdAt,
    anchoredAt: anchorBatches.anchoredAt,
    simulatedSignature: anchorBatches.simulatedSignature,
    simulatedSlot: anchorBatches.simulatedSlot,
    simulatedCommitment: anchorBatches.simulatedCommitment,
    externalAttested: anchorBatches.externalAttested,
  } as const;

  let latestMeta: {
    id: string;
    chainName: string;
    chainFamily: string;
    cluster: string;
    batchHash: string;
    anchorPayload: string | null;
    txRef: string | null;
    txSignature: string | null;
    explorerUrl: string | null;
    walletPublicKey: string | null;
    confirmationStatus: string | null;
    errorMessage: string | null;
    rootHash: string;
    proofCount: number;
    anchorMode: string;
    createdAt: Date;
    anchoredAt: Date | null;
    simulatedSignature: string | null;
    simulatedSlot: string | null;
    simulatedCommitment: string;
    externalAttested: boolean;
  } | null = null;

  if (batchIds.length) {
    let row:
      | {
          id: string;
          chainName: string;
          chainFamily: string;
          cluster: string;
          batchHash: string;
          anchorPayload: string | null;
          txRef: string | null;
          txSignature: string | null;
          explorerUrl: string | null;
          walletPublicKey: string | null;
          confirmationStatus: string | null;
          errorMessage: string | null;
          rootHash: string;
          proofCount: number;
          anchorMode: string;
          createdAt: Date;
          anchoredAt: Date | null;
          simulatedSignature: string | null;
          simulatedSlot: string | null;
          simulatedCommitment: string;
          externalAttested: boolean;
        }
      | undefined;

    if (primaryBatchId !== null) {
      const [primaryRow] = await db.select(batchSelect).from(anchorBatches).where(eq(anchorBatches.id, primaryBatchId)).limit(1);
      row = primaryRow;
    }
    if (row === undefined) {
      const [fallback] = await db
        .select(batchSelect)
        .from(anchorBatches)
        .where(inArray(anchorBatches.id, batchIds))
        .orderBy(desc(anchorBatches.createdAt))
        .limit(1);
      row = fallback;
    }

    if (row) {
      latestMeta = {
        id: row.id,
        chainName: row.chainName,
        chainFamily: row.chainFamily,
        cluster: row.cluster,
        batchHash: row.batchHash,
        anchorPayload: row.anchorPayload,
        txRef: row.txRef,
        txSignature: row.txSignature,
        explorerUrl: row.explorerUrl,
        walletPublicKey: row.walletPublicKey,
        confirmationStatus: row.confirmationStatus,
        errorMessage: row.errorMessage,
        rootHash: row.rootHash,
        proofCount: row.proofCount,
        anchorMode: row.anchorMode,
        createdAt: row.createdAt,
        anchoredAt: row.anchoredAt,
        simulatedSignature: row.simulatedSignature,
        simulatedSlot: row.simulatedSlot,
        simulatedCommitment: row.simulatedCommitment,
        externalAttested: row.externalAttested,
      };
    }
  }

  const anyFailed = units.some((u) => u.anchorState === "failed");
  const allConfirmed = units.every((u) => u.anchorState === "confirmed");
  const anyBatched = units.some(
    (u) => (u.anchorState === "submitted" || (u.anchorState === "pending" && u.anchorBatchId !== null)),
  );
  const anyInBatch = units.some((u) => u.anchorBatchId !== null);

  let anchorStatus: AnchorStatus;
  if (anyFailed) {
    anchorStatus = "anchor_failed";
  } else if (allConfirmed && anyInBatch) {
    anchorStatus = "anchored";
  } else if (anyBatched) {
    anchorStatus = "batched";
  } else {
    anchorStatus = "pending";
  }

  const firstBatch = units.find((u) => u.anchorBatchId !== null);

  productProof.anchor_status = anchorStatus;
  productProof.anchor_batch_id = latestMeta?.id ?? firstBatch?.anchorBatchId ?? null;
  const anchorMode = latestMeta?.anchorMode ?? "mock";
  productProof.anchor_chain =
    anchorMode === "solana-devnet"
      ? "solana-devnet"
      : anchorMode === "sandbox"
        ? "sandbox"
        : anchorMode === "disabled"
          ? "mock"
          : "mock";
  productProof.anchor_mode = anchorMode;
  productProof.anchor_tx_hash = latestMeta?.txSignature ?? latestMeta?.txRef ?? null;
  productProof.anchor_timestamp = latestMeta?.anchoredAt
    ? latestMeta.anchoredAt.toISOString()
    : (latestMeta?.createdAt.toISOString() ?? null);
  productProof.anchor_payload = latestMeta?.anchorPayload ?? null;
  productProof.anchor_explorer_url = latestMeta?.explorerUrl ?? null;
  productProof.anchor_wallet_public_key = latestMeta?.walletPublicKey ?? null;
  productProof.anchor_confirmation_status = latestMeta?.confirmationStatus ?? null;
  productProof.anchor_error_message = latestMeta?.errorMessage ?? null;
  productProof.anchor_root_hash = latestMeta?.rootHash ?? null;
  productProof.anchor_proof_count = latestMeta?.proofCount ?? null;
  productProof.anchor_proof_ids = [...new Set(units.map((u) => u.proofId))];
  if (latestMeta) {
    productProof.solana_sandbox = buildSolanaSandboxAttestationForBatch(latestMeta);
  } else {
    productProof.solana_sandbox = null;
  }
}
