/**
 * Read-only integration helpers for dashboard onboarding (additive API).
 */
import { and, count, desc, eq, isNull, max } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  anchorBatches,
  anchorBatchItems,
  apiKeys,
  baselines,
  canonicalEvents,
  failureLocatorRecords,
  mappingRules,
  proofUnits,
  subjects,
} from "../db/schema/index.js";
import {
  APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY,
  enrichSubjectTimestamps,
} from "./subject-service.js";
import { subjectTypeFromRail } from "./subject-contract.js";
import { starterPayloadForRail } from "./integration-starter-payload.js";
import type { RailType } from "../protocol/angle-applicability.js";
import { SOLANA_SANDBOX_ROUTE } from "../anchor/sandbox-anchor-constants.js";
import {
  buildSolanaSandboxAttestationForBatch,
  simulatedSignatureFromBatchHash,
  simulatedSlotFromBatchHash,
} from "../anchor/solana-simulated-attestation.js";
import { normalizeAnchorMetadata, type CanonicalAnchorMetadata } from "./anchor-metadata-normalizer.js";

/** Shipped with the persisted `anchor_batches.chain_name` default (Solana-oriented sandbox route; not a public L1 write). */
const DEFAULT_ANCHOR_CHAIN_NAME = SOLANA_SANDBOX_ROUTE;

const ANCHOR_MVP_SETTINGS_NOTE =
  "This environment uses the Solana Sandbox Route: a contained, Solana-shaped attestation path for local proof commitments. Batches and `aproof:v1:` payloads are persisted in this workspace; `ssim1_` / slot fields are simulated and deterministic, not a real Solana devnet submission. External attestation and blockchain finality are not enabled until a real on-chain writer is connected — there is no real transaction signature for this route in sandbox.";

function mapUnitToLifecycleState(
  dbState: "pending" | "submitted" | "confirmed" | "failed",
  anchorBatchId: string | null,
): "queued" | "batched" | "submitted" | "confirmed" | "failed" {
  if (dbState === "failed") return "failed";
  if (dbState === "confirmed") return "confirmed";
  if (dbState === "submitted") return "submitted";
  if (dbState === "pending" && anchorBatchId) return "batched";
  return "queued";
}

export type IntegrationBootstrap = {
  organization_id: string;
  environment_id: string;
  subject_id: string;
  subject_type: string;
  source_type_key: string;
  starter_payload: Record<string, unknown>;
  integration_status: {
    baselines_ready: boolean;
    mapping_ready: boolean;
    api_key_present: boolean;
  };
};

export type AnchorMvpReadout = {
  default_chain_name: string;
  /** Display: network family (always honest server value for this product mode). */
  network_family: "Solana";
  /** Same id as `default_chain_name` for the Solana sandbox; explicit for UIs. */
  route: typeof SOLANA_SANDBOX_ROUTE;
  /** Honest local cluster — not a live public RPC in sandbox mode. */
  cluster: string;
  pending_queued_count: number;
  in_batch_pending_count: number;
  mvp_policy: {
    mode: "server_managed";
    batch_window_user_configurable: false;
    description: string;
  };
  latest_batch: null | {
    anchor_id: string;
    batch_id: string;
    batch_hash: string;
    root_hash: string;
    chain_name: string;
    chain_family: string;
    cluster: string;
    anchor_payload: string | null;
    simulated_signature: string;
    simulated_slot: string;
    simulated_commitment: string;
    /** Always false in sandbox; present for forward-compatible UI. */
    external_attested: boolean;
    tx_ref: string | null;
    tx_signature: string | null;
    explorer_url: string | null;
    wallet_public_key: string | null;
    confirmation_status: string | null;
    error_message: string | null;
    network: string;
    anchor_mode: string;
    anchor_metadata: CanonicalAnchorMetadata;
    status: string;
    proof_count: number;
    created_at: string;
    anchored_at: string | null;
  };
};

export type IntegrationStatus = {
  baselines_ready: boolean;
  mapping_ready: boolean;
  mapping_is_default_only: boolean;
  api_key_present: boolean;
  last_event_at: string | null;
  last_proof_at: string | null;
  last_failure_at: string | null;
  anchor_state_summary: {
    queued: number;
    batched: number;
    submitted: number;
    confirmed: number;
    failed: number;
  };
  /** Control-plane readout: persisted chain + live counts + latest batch row for this subject (no invented policy knobs). */
  anchor_readout: AnchorMvpReadout;
};

export type MappingListItem = {
  source_type_key: string;
  canonical_event_type: string;
  is_default: boolean;
  is_active: boolean;
};

export async function getIntegrationBootstrap(
  db: Db,
  params: { subjectId: string; organizationId: string; environmentId: string },
): Promise<IntegrationBootstrap | null> {
  const [row] = await db
    .select()
    .from(subjects)
    .where(
      and(
        eq(subjects.id, params.subjectId),
        eq(subjects.organizationId, params.organizationId),
        eq(subjects.environmentId, params.environmentId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const rail = row.railType as RailType;
  const [baselineCount] = await db
    .select({ c: count() })
    .from(baselines)
    .where(eq(baselines.subjectId, params.subjectId));

  const [mappingCount] = await db
    .select({ c: count() })
    .from(mappingRules)
    .where(
      and(
        eq(mappingRules.organizationId, params.organizationId),
        eq(mappingRules.environmentId, params.environmentId),
        eq(mappingRules.isActive, true),
      ),
    );

  const [keyCount] = await db
    .select({ c: count() })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.organizationId, params.organizationId),
        eq(apiKeys.environmentId, params.environmentId),
        isNull(apiKeys.revokedAt),
      ),
    );

  const baselines_ready = Number(baselineCount?.c ?? 0) >= 7;
  const mapping_ready = Number(mappingCount?.c ?? 0) > 0;
  const api_key_present = Number(keyCount?.c ?? 0) > 0;

  return {
    organization_id: row.organizationId,
    environment_id: row.environmentId,
    subject_id: row.id,
    subject_type: subjectTypeFromRail(row.railType),
    source_type_key: APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY,
    starter_payload: starterPayloadForRail(rail),
    integration_status: {
      baselines_ready,
      mapping_ready,
      api_key_present,
    },
  };
}

export async function getIntegrationStatus(
  db: Db,
  params: { subjectId: string; organizationId: string; environmentId: string },
): Promise<IntegrationStatus | null> {
  const [row] = await db
    .select()
    .from(subjects)
    .where(
      and(
        eq(subjects.id, params.subjectId),
        eq(subjects.organizationId, params.organizationId),
        eq(subjects.environmentId, params.environmentId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const [baselineCount] = await db
    .select({ c: count() })
    .from(baselines)
    .where(eq(baselines.subjectId, params.subjectId));

  const mappingRows = await db
    .select({ sourceTypeKey: mappingRules.sourceTypeKey, isActive: mappingRules.isActive })
    .from(mappingRules)
    .where(
      and(
        eq(mappingRules.organizationId, params.organizationId),
        eq(mappingRules.environmentId, params.environmentId),
        eq(mappingRules.isActive, true),
      ),
    );

  const mapping_ready = mappingRows.length > 0;
  const mapping_is_default_only =
    mapping_ready &&
    mappingRows.every((m) => m.sourceTypeKey === APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY);

  const [keyCount] = await db
    .select({ c: count() })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.organizationId, params.organizationId),
        eq(apiKeys.environmentId, params.environmentId),
        isNull(apiKeys.revokedAt),
      ),
    );

  const ts = await enrichSubjectTimestamps(db, params.subjectId);

  const [failMax] = await db
    .select({ latest: max(failureLocatorRecords.createdAt) })
    .from(failureLocatorRecords)
    .innerJoin(proofUnits, eq(failureLocatorRecords.proofId, proofUnits.proofId))
    .innerJoin(canonicalEvents, eq(proofUnits.eventId, canonicalEvents.eventId))
    .where(eq(canonicalEvents.subjectId, params.subjectId));

  const unitRows = await db
    .select({
      anchorState: proofUnits.anchorState,
      anchorBatchId: proofUnits.anchorBatchId,
    })
    .from(proofUnits)
    .innerJoin(canonicalEvents, eq(proofUnits.eventId, canonicalEvents.eventId))
    .where(eq(canonicalEvents.subjectId, params.subjectId));

  const anchor_state_summary = {
    queued: 0,
    batched: 0,
    submitted: 0,
    confirmed: 0,
    failed: 0,
  };
  for (const u of unitRows) {
    const lc = mapUnitToLifecycleState(u.anchorState, u.anchorBatchId ?? null);
    anchor_state_summary[lc] += 1;
  }

  const [latestBatch] = await db
    .select({
      id: anchorBatches.id,
      batchHash: anchorBatches.batchHash,
      rootHash: anchorBatches.rootHash,
      chainName: anchorBatches.chainName,
      chainFamily: anchorBatches.chainFamily,
      cluster: anchorBatches.cluster,
      anchorPayload: anchorBatches.anchorPayload,
      simulatedSignature: anchorBatches.simulatedSignature,
      simulatedSlot: anchorBatches.simulatedSlot,
      simulatedCommitment: anchorBatches.simulatedCommitment,
      externalAttested: anchorBatches.externalAttested,
      txRef: anchorBatches.txRef,
      txSignature: anchorBatches.txSignature,
      explorerUrl: anchorBatches.explorerUrl,
      walletPublicKey: anchorBatches.walletPublicKey,
      confirmationStatus: anchorBatches.confirmationStatus,
      errorMessage: anchorBatches.errorMessage,
      anchorMode: anchorBatches.anchorMode,
      status: anchorBatches.status,
      proofCount: anchorBatches.proofCount,
      createdAt: anchorBatches.createdAt,
      anchoredAt: anchorBatches.anchoredAt,
    })
    .from(anchorBatches)
    .innerJoin(anchorBatchItems, eq(anchorBatchItems.batchId, anchorBatches.id))
    .innerJoin(proofUnits, eq(anchorBatchItems.proofId, proofUnits.proofId))
    .innerJoin(canonicalEvents, eq(proofUnits.eventId, canonicalEvents.eventId))
    .where(eq(canonicalEvents.subjectId, params.subjectId))
    .orderBy(desc(anchorBatches.createdAt))
    .limit(1);

  const defRoute = (latestBatch?.chainName?.trim() || DEFAULT_ANCHOR_CHAIN_NAME) as typeof SOLANA_SANDBOX_ROUTE;
  const defCluster = latestBatch?.cluster?.trim() || "sandbox-devnet";
  const anchor_readout: AnchorMvpReadout = {
    default_chain_name: defRoute,
    network_family: "Solana",
    route: SOLANA_SANDBOX_ROUTE,
    cluster: defCluster,
    pending_queued_count: anchor_state_summary.queued,
    in_batch_pending_count: anchor_state_summary.batched,
    mvp_policy: {
      mode: "server_managed",
      batch_window_user_configurable: false,
      description: ANCHOR_MVP_SETTINGS_NOTE,
    },
    latest_batch: latestBatch
      ? (() => {
          const s = buildSolanaSandboxAttestationForBatch(latestBatch);
          const simSig =
            s?.simulated_signature ??
            latestBatch.simulatedSignature ??
            simulatedSignatureFromBatchHash(latestBatch.batchHash);
          const simSlot =
            s?.simulated_slot ??
            latestBatch.simulatedSlot ??
            simulatedSlotFromBatchHash(latestBatch.batchHash);
          return {
            anchor_id: latestBatch.id,
            batch_id: latestBatch.id,
            batch_hash: latestBatch.batchHash,
            root_hash: latestBatch.rootHash,
            chain_name: latestBatch.chainName,
            chain_family: latestBatch.chainFamily,
            cluster: latestBatch.cluster,
            anchor_payload: latestBatch.anchorPayload ?? null,
            simulated_signature: simSig,
            simulated_slot: simSlot,
            simulated_commitment: s?.simulated_commitment ?? latestBatch.simulatedCommitment,
            external_attested: s ? s.external_attested : latestBatch.externalAttested,
            tx_ref: latestBatch.txRef,
            tx_signature: latestBatch.txSignature ?? latestBatch.txRef,
            explorer_url: latestBatch.explorerUrl ?? null,
            wallet_public_key: latestBatch.walletPublicKey ?? null,
            confirmation_status: latestBatch.confirmationStatus ?? null,
            error_message: latestBatch.errorMessage ?? null,
            network: latestBatch.chainName,
            anchor_mode: latestBatch.anchorMode,
            anchor_metadata: normalizeAnchorMetadata(
              {
                anchor_id: latestBatch.id,
                batch_id: latestBatch.id,
                root_hash: latestBatch.rootHash,
                proof_count: latestBatch.proofCount,
                proof_ids: [],
                network: latestBatch.chainName,
                cluster: latestBatch.cluster,
                anchor_mode: latestBatch.anchorMode,
                tx_signature: latestBatch.txSignature ?? latestBatch.txRef,
                explorer_url: latestBatch.explorerUrl ?? null,
                wallet_public_key: latestBatch.walletPublicKey ?? null,
                confirmation_status: latestBatch.confirmationStatus ?? null,
                anchored_at: latestBatch.anchoredAt ? latestBatch.anchoredAt.toISOString() : null,
                created_at: latestBatch.createdAt.toISOString(),
                error_message: latestBatch.errorMessage ?? null,
                status: String(latestBatch.status),
              },
              { anchoringEnabled: latestBatch.anchorMode === "solana-devnet" },
            ),
            status: String(latestBatch.status),
            proof_count: latestBatch.proofCount,
            created_at: latestBatch.createdAt.toISOString(),
            anchored_at: latestBatch.anchoredAt ? latestBatch.anchoredAt.toISOString() : null,
          };
        })()
      : null,
  };

  return {
    baselines_ready: Number(baselineCount?.c ?? 0) >= 7,
    mapping_ready,
    mapping_is_default_only,
    api_key_present: Number(keyCount?.c ?? 0) > 0,
    last_event_at: ts.latest_event_timestamp,
    last_proof_at: ts.latest_proof_timestamp,
    last_failure_at: failMax?.latest ? new Date(failMax.latest).toISOString() : null,
    anchor_state_summary,
    anchor_readout,
  };
}

export async function listMappingsForSubjectEnv(
  db: Db,
  params: { subjectId: string; organizationId: string; environmentId: string },
): Promise<{ items: MappingListItem[] } | null> {
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
  if (!sub) return null;

  const rows = await db
    .select({
      sourceTypeKey: mappingRules.sourceTypeKey,
      canonicalEventType: mappingRules.canonicalEventType,
      isActive: mappingRules.isActive,
    })
    .from(mappingRules)
    .where(
      and(
        eq(mappingRules.organizationId, params.organizationId),
        eq(mappingRules.environmentId, params.environmentId),
      ),
    )
    .orderBy(mappingRules.sourceTypeKey);

  const items: MappingListItem[] = rows.map((r) => ({
    source_type_key: r.sourceTypeKey,
    canonical_event_type: r.canonicalEventType,
    is_default: r.sourceTypeKey === APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY,
    is_active: r.isActive,
  }));

  return { items };
}
