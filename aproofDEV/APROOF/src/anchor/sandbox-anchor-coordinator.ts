import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { anchorBatchItems, anchorBatches, proofUnits, subjects } from "../db/schema/index.js";
import { mvpAnchorBatchHashes, proofDigest } from "../protocol/anchor-batch-hash.js";
import {
  formatSandboxAnchorPayload,
  SANDBOX_ANCHOR_BATCH_MAX_UNITS,
  SOLANA_CHAIN_FAMILY,
  SOLANA_SANDBOX_CLUSTER,
  SOLANA_SANDBOX_ROUTE,
} from "./sandbox-anchor-constants.js";
import {
  resolveAnchorMode,
  resolveSolanaDevnetConfig,
  submitSolanaDevnetMemo,
} from "./solana-devnet-anchor.js";
import {
  SIMULATED_COMMITMENT_SANDBOX_FINALIZED,
  simulatedSignatureFromBatchHash,
  simulatedSlotFromBatchHash,
} from "./solana-simulated-attestation.js";
const ANCHOR_DEBUG = process.env.APROOF_ANCHOR_DEBUG === "1";

/**
 * Forms batches from pending proof units using the canonical per-unit proof digest, persists
 * `anchor_batches` + `anchor_batch_items`, and advances unit `anchor_state` to `confirmed`.
 * Real DB-backed solana-sandbox route (contained, Solana-shaped). Does not create layer-1 tx ids;
 * a future `SolanaDevnetAnchorWriter` swaps in while keeping the same commit pipeline to `anchor_payload`.
 */
export async function runSandboxAnchorCoordinatorForSubject(
  db: Db,
  params: { subjectId: string; organizationId: string; environmentId: string },
): Promise<{ batchesCreated: number }> {
  const [sub] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(
        eq(subjects.id, params.subjectId),
        eq(subjects.organizationId, params.organizationId),
        eq(subjects.environmentId, params.environmentId),
      ),
    )
    .limit(1);
  if (!sub) return { batchesCreated: 0 };

  let batchesCreated = 0;

  while (true) {
    const pending = await db
      .select({
        proofId: proofUnits.proofId,
        angle: proofUnits.angle,
        status: proofUnits.status,
        deltaCode: proofUnits.deltaCode,
      })
      .from(proofUnits)
      .innerJoin(subjects, eq(proofUnits.subjectId, subjects.id))
      .where(
        and(
          eq(proofUnits.subjectId, params.subjectId),
          eq(subjects.organizationId, params.organizationId),
          eq(subjects.environmentId, params.environmentId),
          eq(proofUnits.anchorState, "pending"),
          isNull(proofUnits.anchorBatchId),
        ),
      )
      .orderBy(asc(proofUnits.createdAt), asc(proofUnits.proofId));

    if (pending.length === 0) break;

    const take =
      pending.length >= SANDBOX_ANCHOR_BATCH_MAX_UNITS
        ? SANDBOX_ANCHOR_BATCH_MAX_UNITS
        : pending.length;

    const slice = pending.slice(0, take);
    const orderedDigests = slice.map((u) =>
      proofDigest({
        proof_id: u.proofId,
        angle: u.angle,
        status: u.status,
        delta_code: u.deltaCode,
      }),
    );
    const { batchHash, rootHash } = mvpAnchorBatchHashes(orderedDigests);
    const payload = formatSandboxAnchorPayload(batchHash);
    const simSig = simulatedSignatureFromBatchHash(batchHash);
    const simSlot = simulatedSlotFromBatchHash(batchHash);
    const now = new Date();
    const resolvedMode = resolveAnchorMode();
    const proofIds = slice.map((s) => s.proofId);

    const batchId = randomUUID();
    let nextStatus: "confirmed" | "failed" = "confirmed";
    let txSignature: string | null = null;
    let explorerUrl: string | null = null;
    let walletPublicKey: string | null = null;
    let confirmationStatus: string | null = null;
    let anchoredAt: Date | null = null;
    let errorMessage: string | null = null;
    const network = resolvedMode === "solana-devnet" ? "solana-devnet" : resolvedMode;
    const persistAnchorMode = resolvedMode;
    if (ANCHOR_DEBUG) {
      console.info(
        "[anchor] preparing anchor batch",
        JSON.stringify({
          anchor_mode: resolvedMode,
          network,
          root_hash: rootHash,
          proof_count: slice.length,
        }),
      );
    }
    if (resolvedMode === "solana-devnet") {
      try {
        const config = resolveSolanaDevnetConfig();
        const submitted = await submitSolanaDevnetMemo({
          config,
          rootHash,
          proofCount: slice.length,
          createdAtIso: now.toISOString(),
        });
        txSignature = submitted.tx_signature;
        explorerUrl = submitted.explorer_url;
        walletPublicKey = submitted.wallet_public_key;
        confirmationStatus = submitted.confirmation_status;
        anchoredAt = new Date(submitted.anchored_at);
        if (ANCHOR_DEBUG) {
          console.info(
            "[anchor] devnet anchor confirmed",
            JSON.stringify({
              anchor_mode: resolvedMode,
              network,
              root_hash: rootHash,
              proof_count: slice.length,
              wallet_public_key: walletPublicKey,
              tx_signature: txSignature,
              confirmation_status: confirmationStatus,
            }),
          );
        }
      } catch (error) {
        nextStatus = "failed";
        const msg = error instanceof Error ? error.message : String(error);
        errorMessage = msg;
        if (ANCHOR_DEBUG) {
          console.warn(
            "[anchor] devnet anchor failed",
            JSON.stringify({
              anchor_mode: resolvedMode,
              network,
              root_hash: rootHash,
              proof_count: slice.length,
              error_message: errorMessage,
            }),
          );
        }
      }
    } else if (resolvedMode === "mock" || resolvedMode === "sandbox") {
      confirmationStatus = "mocked";
      nextStatus = "confirmed";
    } else {
      confirmationStatus = null;
      nextStatus = "confirmed";
    }
    await db.transaction(async (tx) => {
      await tx.insert(anchorBatches).values({
        id: batchId,
        batchHash,
        rootHash,
        proofCount: slice.length,
        chainFamily: SOLANA_CHAIN_FAMILY,
        chainName: resolvedMode === "solana-devnet" ? "solana-devnet" : SOLANA_SANDBOX_ROUTE,
        anchorMode: persistAnchorMode,
        cluster: resolvedMode === "solana-devnet" ? "devnet" : SOLANA_SANDBOX_CLUSTER,
        txRef: txSignature,
        txSignature,
        explorerUrl,
        walletPublicKey,
        confirmationStatus,
        anchorPayload: payload,
        simulatedSignature: simSig,
        simulatedSlot: simSlot,
        simulatedCommitment: SIMULATED_COMMITMENT_SANDBOX_FINALIZED,
        externalAttested: resolvedMode === "solana-devnet" && nextStatus === "confirmed",
        status: nextStatus,
        errorMessage,
        createdAt: now,
        updatedAt: now,
        anchoredAt,
      });
      for (let i = 0; i < slice.length; i += 1) {
        await tx.insert(anchorBatchItems).values({
          batchId,
          ordinal: i,
          proofId: slice[i]!.proofId,
        });
      }
      await tx
        .update(proofUnits)
        .set({
          anchorBatchId: batchId,
          anchorState: nextStatus === "confirmed" ? "confirmed" : "failed",
        })
        .where(inArray(proofUnits.proofId, proofIds));
    });

    batchesCreated += 1;
  }

  return { batchesCreated };
}
