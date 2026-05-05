/**
 * Lineage/traceability read service: list lineages, lineage detail with
 * version timeline, delta inspector, and anchor mapping.
 */
import { and, asc, count, desc, eq, inArray, max, min, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { anchorBatches, canonicalEvents, proofUnits } from "../db/schema/index.js";
import { normalizeAnchorMetadata, type CanonicalAnchorMetadata } from "./anchor-metadata-normalizer.js";

export type LineageListItem = {
  lineage_id: string;
  artifact_id: string | null;
  artifact_summary: string | null;
  version_count: number;
  first_seen: string | null;
  last_updated: string | null;
};

export type LineageVersionEntry = {
  event_id: string;
  version: number;
  timestamp: string;
  canonical_hash: string;
  proof_id: string | null;
};

export type DeltaEntry = {
  from_version: number;
  to_version: number;
  changed_fields: string[];
  delta_summary: string | null;
};

export type AnchorMapping = {
  version: number;
  anchored: boolean;
  anchor_batch_id: string | null;
  root_hash: string | null;
  network: string | null;
  tx_signature: string | null;
  explorer_url: string | null;
  wallet_public_key: string | null;
  status: string;
  confirmation_status: string | null;
  anchored_at: string | null;
  anchor_metadata: CanonicalAnchorMetadata;
};

export type LineageDetail = {
  lineage_id: string;
  artifact_id: string | null;
  /** Ordered canonical events in this lineage (same entries as `version_timeline`). */
  ordered_event_sequence: LineageVersionEntry[];
  /** Distinct proof unit ids referenced by the sequence, sorted. */
  related_proofs: string[];
  /** Version-to-version deltas (same entries as `delta_inspector`). */
  version_progression: DeltaEntry[];
  /** Per-version anchor batch linkage (same entries as `anchor_mapping`). */
  anchor_linkage: AnchorMapping[];
  artifact_identity: {
    artifact_id: string | null;
    stable_identity_summary: string | null;
    metadata: Record<string, unknown>;
  };
  version_timeline: LineageVersionEntry[];
  delta_inspector: DeltaEntry[];
  anchor_mapping: AnchorMapping[];
  metadata: Record<string, unknown>;
};

/** Same primary proof row as `buildProductProof` (`policy_integrity` unit). */
function primaryProofUnitForEvent(
  rows: Array<{ angle: string; proofId: string; anchorBatchId: string | null }>,
): { proofId: string; anchorBatchId: string | null } | null {
  const pol = rows.find((u) => u.angle === "policy_integrity");
  if (pol) return pol;
  const sorted = [...rows].sort((a, b) => a.angle.localeCompare(b.angle));
  return sorted[0] ?? null;
}

export async function listLineagesForSubject(
  db: Db,
  params: {
    subjectId: string;
    organizationId: string;
    environmentId: string;
    limit: number;
    offset: number;
  }
): Promise<{ items: LineageListItem[]; total: number }> {
  const scope = and(
    eq(canonicalEvents.subjectId, params.subjectId),
    eq(canonicalEvents.organizationId, params.organizationId),
    eq(canonicalEvents.environmentId, params.environmentId)
  );

  const countRows = await db
    .select({
      lineageId: canonicalEvents.eventLineageId,
    })
    .from(canonicalEvents)
    .where(scope)
    .groupBy(canonicalEvents.eventLineageId);
  const total = countRows.length;

  const groupRows = await db
    .select({
      lineageId: canonicalEvents.eventLineageId,
      artifactId: sql<string>`min(${canonicalEvents.artifactId}::text)`,
      versionCount: count(),
      firstSeen: min(canonicalEvents.occurredAt),
      lastUpdated: max(canonicalEvents.occurredAt),
      identitySummary: sql<string | null>`min(${canonicalEvents.artifactIdentitySummary})`,
    })
    .from(canonicalEvents)
    .where(scope)
    .groupBy(canonicalEvents.eventLineageId)
    .orderBy(desc(max(canonicalEvents.occurredAt)))
    .limit(params.limit)
    .offset(params.offset);

  const items: LineageListItem[] = groupRows.map((r) => ({
    lineage_id: r.lineageId,
    artifact_id: r.artifactId ?? null,
    artifact_summary: r.identitySummary,
    version_count: Number(r.versionCount),
    first_seen: r.firstSeen ? new Date(r.firstSeen).toISOString() : null,
    last_updated: r.lastUpdated ? new Date(r.lastUpdated).toISOString() : null,
  }));

  return { items, total };
}

export async function getLineageDetail(
  db: Db,
  params: { lineageId: string; organizationId: string; environmentId: string }
): Promise<LineageDetail | null> {
  const scope = and(
    eq(canonicalEvents.eventLineageId, params.lineageId),
    eq(canonicalEvents.organizationId, params.organizationId),
    eq(canonicalEvents.environmentId, params.environmentId)
  );

  const events = await db
    .select({
      eventId: canonicalEvents.eventId,
      artifactId: canonicalEvents.artifactId,
      eventVersion: canonicalEvents.eventVersion,
      occurredAt: canonicalEvents.occurredAt,
      canonicalHash: canonicalEvents.canonicalHash,
      identitySummary: canonicalEvents.artifactIdentitySummary,
      payload: canonicalEvents.payload,
    })
    .from(canonicalEvents)
    .where(scope)
    .orderBy(asc(canonicalEvents.eventVersion));

  if (events.length === 0) return null;

  const firstEvent = events[0];

  const eventIds = events.map((e) => e.eventId);
  const unitRows = eventIds.length
    ? await db
        .select({
          eventId: proofUnits.eventId,
          angle: proofUnits.angle,
          proofId: proofUnits.proofId,
          anchorBatchId: proofUnits.anchorBatchId,
        })
        .from(proofUnits)
        .where(inArray(proofUnits.eventId, eventIds))
    : [];

  const unitsByEvent = new Map<string, typeof unitRows>();
  for (const u of unitRows) {
    const arr = unitsByEvent.get(u.eventId) ?? [];
    arr.push(u);
    unitsByEvent.set(u.eventId, arr);
  }

  const batchIds = [
    ...new Set(
      events
        .map((ev) => primaryProofUnitForEvent(unitsByEvent.get(ev.eventId) ?? [])?.anchorBatchId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const batchRows = batchIds.length
    ? await db
        .select({
          id: anchorBatches.id,
          rootHash: anchorBatches.rootHash,
          chainName: anchorBatches.chainName,
          cluster: anchorBatches.cluster,
          anchorMode: anchorBatches.anchorMode,
          txSignature: anchorBatches.txSignature,
          txRef: anchorBatches.txRef,
          explorerUrl: anchorBatches.explorerUrl,
          walletPublicKey: anchorBatches.walletPublicKey,
          confirmationStatus: anchorBatches.confirmationStatus,
          status: anchorBatches.status,
          anchoredAt: anchorBatches.anchoredAt,
          proofCount: anchorBatches.proofCount,
          errorMessage: anchorBatches.errorMessage,
          createdAt: anchorBatches.createdAt,
        })
        .from(anchorBatches)
        .where(inArray(anchorBatches.id, batchIds))
    : [];

  const batchById = new Map(batchRows.map((b) => [b.id, b]));

  // Build version timeline with proof_id aligned to ProductProof.proof_id (policy_integrity unit).
  const versionTimeline: LineageVersionEntry[] = [];
  for (const ev of events) {
    const primary = primaryProofUnitForEvent(unitsByEvent.get(ev.eventId) ?? []);
    versionTimeline.push({
      event_id: ev.eventId,
      version: ev.eventVersion,
      timestamp: ev.occurredAt.toISOString(),
      canonical_hash: ev.canonicalHash,
      proof_id: primary?.proofId ?? null,
    });
  }

  // Delta inspector: compare consecutive versions' payloads
  const deltaInspector: DeltaEntry[] = [];
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    const prevPayload = (prev.payload && typeof prev.payload === "object" ? prev.payload : {}) as Record<string, unknown>;
    const currPayload = (curr.payload && typeof curr.payload === "object" ? curr.payload : {}) as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(prevPayload), ...Object.keys(currPayload)]);
    const changedFields: string[] = [];
    for (const key of allKeys) {
      if (JSON.stringify(prevPayload[key]) !== JSON.stringify(currPayload[key])) {
        changedFields.push(key);
      }
    }
    changedFields.sort((a, b) => a.localeCompare(b));
    deltaInspector.push({
      from_version: prev.eventVersion,
      to_version: curr.eventVersion,
      changed_fields: changedFields,
      delta_summary: changedFields.length > 0 ? `${changedFields.length} field(s) changed` : null,
    });
  }

  // Anchor mapping — same persisted batch as GET /events /proofs (primary unit's anchor_batch_id).
  const anchorMapping: AnchorMapping[] = [];
  for (const ev of events) {
    const primary = primaryProofUnitForEvent(unitsByEvent.get(ev.eventId) ?? []);
    const batch =
      primary?.anchorBatchId !== null && primary?.anchorBatchId !== undefined
        ? batchById.get(primary.anchorBatchId)
        : undefined;
    const txSig = batch?.txSignature ?? batch?.txRef ?? null;
    anchorMapping.push({
      version: ev.eventVersion,
      anchored: !!batch,
      anchor_batch_id: batch?.id ?? null,
      root_hash: batch?.rootHash ?? null,
      network: batch?.chainName ?? null,
      tx_signature: txSig,
      explorer_url: batch?.explorerUrl ?? null,
      wallet_public_key: batch?.walletPublicKey ?? null,
      status: batch ? String(batch.status) : "pending",
      confirmation_status: batch?.confirmationStatus ?? null,
      anchored_at: batch?.anchoredAt ? new Date(batch.anchoredAt).toISOString() : null,
      anchor_metadata: normalizeAnchorMetadata(
        {
          anchor_id: batch?.id ?? null,
          batch_id: batch?.id ?? null,
          root_hash: batch?.rootHash ?? null,
          proof_count: batch?.proofCount ?? null,
          proof_ids: primary?.proofId ? [primary.proofId] : [],
          network: batch?.chainName ?? null,
          cluster: batch?.cluster ?? null,
          anchor_mode: batch?.anchorMode ?? null,
          tx_signature: txSig,
          explorer_url: batch?.explorerUrl ?? null,
          wallet_public_key: batch?.walletPublicKey ?? null,
          status: batch ? String(batch.status) : "pending",
          confirmation_status: batch?.confirmationStatus ?? null,
          anchored_at: batch?.anchoredAt ? new Date(batch.anchoredAt).toISOString() : null,
          created_at: batch?.createdAt ? batch.createdAt.toISOString() : null,
          error_message: batch?.errorMessage ?? null,
        },
        { anchoringEnabled: batch?.anchorMode === "solana-devnet" },
      ),
    });
  }

  const relatedProofs = [
    ...new Set(versionTimeline.map((v) => v.proof_id).filter((id): id is string => id !== null)),
  ].sort((a, b) => a.localeCompare(b));

  return {
    lineage_id: params.lineageId,
    artifact_id: firstEvent.artifactId ?? null,
    ordered_event_sequence: versionTimeline,
    related_proofs: relatedProofs,
    version_progression: deltaInspector,
    anchor_linkage: anchorMapping,
    artifact_identity: {
      artifact_id: firstEvent.artifactId ?? null,
      stable_identity_summary: firstEvent.identitySummary ?? null,
      metadata: {},
    },
    version_timeline: versionTimeline,
    delta_inspector: deltaInspector,
    anchor_mapping: anchorMapping,
    metadata: {},
  };
}
