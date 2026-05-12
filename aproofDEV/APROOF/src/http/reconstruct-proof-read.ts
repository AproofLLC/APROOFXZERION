import { and, asc, count, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  canonicalEvents,
  failureLocatorRecords,
  proofUnits,
  rawEvents,
  subjects,
} from "../db/schema/index.js";
import { buildFailureRollup } from "../product/failure-intelligence.js";
import { buildProductProof } from "../product/build-product-proof.js";
import {
  type CanonicalIdentityContract as ApiIdentitySnapshot,
  canonicalIdentityContractFromCanonicalRow,
} from "../pipeline/identity-contract.js";
import {
  computeArtifactSignatureForLineage,
  computeOccurrenceSignatureForLineage,
  type LineageResolutionResult,
} from "../product/lineage-resolver.js";
import type { RailType } from "../protocol/angle-applicability.js";
import type { PipelineProofUnit, ProcessEventSuccess } from "../pipeline/process-event.js";
import { type PostEventBody, postEventBodySchema } from "./events-schema.js";
import { finalizeEnvelopeProductProof } from "./proof-read-envelope.js";
import { loadBaselineControlSnapshot } from "./baselines-service.js";
import { applyPersistedAnchorToProductProof } from "./apply-persisted-anchor-to-product-proof.js";

function mapProofUnitRow(r: {
  proofId: string;
  angle: string;
  status: PipelineProofUnit["status"];
  deltaCode: string | null;
  evidenceJson: unknown;
}): PipelineProofUnit {
  const evidence = r.evidenceJson && typeof r.evidenceJson === "object" ? (r.evidenceJson as Record<string, unknown>) : {};
  const diffRaw = evidence.diff;
  const diff =
    diffRaw && typeof diffRaw === "object"
      ? (diffRaw as PipelineProofUnit["diff"])
      : undefined;
  const baseline_snapshot = evidence.baseline_snapshot;
  const evidence_records = Array.isArray(evidence.evidence_records)
    ? (evidence.evidence_records as Array<Record<string, unknown>>)
    : [];
  const evidence_refs = evidence_records
    .map((ev) => (typeof ev.evidence_id === "string" ? ev.evidence_id : null))
    .filter((v): v is string => v !== null);
  return {
    proof_id: r.proofId,
    angle: r.angle as PipelineProofUnit["angle"],
    status: r.status,
    delta_code: r.deltaCode,
    baseline_snapshot:
      baseline_snapshot && typeof baseline_snapshot === "object"
        ? (baseline_snapshot as Record<string, unknown>)
        : undefined,
    diff,
    evidence_refs,
  };
}

/**
 * Build a LineageResolutionResult from persisted canonical event + parsed POST body.
 * Recomputes artifact/occurrence signatures with the same algorithm as ingest lineage resolution.
 */
function buildLineageFromCanonicalEvent(
  ce: {
    eventId: string;
    eventLineageId: string;
    eventVersion: number;
    canonicalHash: string;
    artifactId: string;
    subjectId: string;
    eventType: string;
    traceId: string;
    occurredAt: Date;
    lineageStatus: string;
    lineageReason: string;
    matchedPriorEventId: string | null;
    matchedPriorVersion: number | null;
    resolverArtifactHash: string | null;
    resolverOccurrenceHash: string | null;
  },
  body: PostEventBody
): LineageResolutionResult {
  const payload =
    body.payload !== null && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};
  const canonical_event_type = ce.eventType;
  const artifact_hash =
    ce.resolverArtifactHash ??
    computeArtifactSignatureForLineage({
      artifact_id: ce.artifactId,
      subject_id: ce.subjectId,
      canonical_event_type,
    });
  const occurrence_hash =
    ce.resolverOccurrenceHash ??
    computeOccurrenceSignatureForLineage({
      event_id: ce.eventId,
      trace_id: ce.traceId,
      subject_id: ce.subjectId,
      canonical_event_type,
      occurred_at: ce.occurredAt,
      payload,
    });
  return {
    event_id: ce.eventId,
    event_lineage_id: ce.eventLineageId,
    event_version: ce.eventVersion,
    lineage_status: ce.lineageStatus as LineageResolutionResult["lineage_status"],
    matched_prior_event_id: ce.matchedPriorEventId,
    matched_prior_version: ce.matchedPriorVersion,
    lineage_reason: ce.lineageReason,
    canonical_hash: ce.canonicalHash,
    artifact_hash,
    occurrence_hash,
    artifact_id: ce.artifactId,
  };
}

/**
 * Resolve `GET /proofs/:id` lookup: `id` may be canonical **event_id** or any **proof_id** (proof unit row).
 */
export async function resolveCanonicalEventIdForProofLookup(
  db: Db,
  params: { id: string; organizationId: string; environmentId: string }
): Promise<string | null> {
  const { id, organizationId, environmentId } = params;

  const [byEvent] = await db
    .select({ eventId: canonicalEvents.eventId })
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.eventId, id),
        eq(canonicalEvents.organizationId, organizationId),
        eq(canonicalEvents.environmentId, environmentId)
      )
    )
    .limit(1);
  if (byEvent) return byEvent.eventId;

  const [byProof] = await db
    .select({ eventId: proofUnits.eventId })
    .from(proofUnits)
    .innerJoin(canonicalEvents, eq(canonicalEvents.eventId, proofUnits.eventId))
    .where(
      and(
        eq(proofUnits.proofId, id),
        eq(canonicalEvents.organizationId, organizationId),
        eq(canonicalEvents.environmentId, environmentId)
      )
    )
    .limit(1);
  return byProof?.eventId ?? null;
}

/**
 * Rebuilds the same envelope as `POST /events` 201 (before disclosure) for a stored proofable event.
 *
 * RECONSTRUCTION CONTRACT BOUNDARY:
 *
 * Persisted state used directly (not recomputed):
 * - canonical_events row: eventId, eventLineageId, eventVersion, canonicalHash, logicalHash,
 *   lineageStatus, lineageReason, matchedPriorEventId, resolverArtifactHash, resolverOccurrenceHash,
 *   artifactId, subjectId, eventType, railType, createdAt
 * - proof_units rows: proofId, angle, status, deltaCode, evidenceJson
 * - failure_locator_records: count only
 *
 * Recomputed from persisted state + stored raw payload:
 * - product_proof (via buildProductProof)
 * - failure_intelligence (via buildFailureRollup)
 * - identity contract (via canonicalIdentityContractFromCanonicalRow)
 * - artifact_hash/occurrence_hash (prefer persisted resolver columns; fallback to recompute)
 *
 * Invariants:
 * - lineage_anomaly is always null on reconstruction (ingest-only field)
 * - proof_build_received_at uses canonical row createdAt (not current time)
 * - Repeated calls with same eventId produce identical output (deterministic)
 * - Fields such as proof_sufficiency are derived by buildProductProof on each read (not digest inputs);
 *   they remain deterministic given the same persisted inputs.
 */
export async function reconstructEventProofEnvelope(
  db: Db,
  params: { eventId: string; organizationId: string; environmentId: string }
): Promise<
  | { ok: true; envelope: Record<string, unknown> }
  | { ok: false; code: "NOT_PROOFABLE"; reason: string; raw_event_id: string }
  | null
> {
  const [ce] = await db
    .select()
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.eventId, params.eventId),
        eq(canonicalEvents.organizationId, params.organizationId),
        eq(canonicalEvents.environmentId, params.environmentId)
      )
    )
    .limit(1);

  if (!ce) return null;

  if (ce.proofability !== "proofable") {
    return {
      ok: false,
      code: "NOT_PROOFABLE",
      reason: ce.quarantineReason ?? "canonical_not_proofable",
      raw_event_id: ce.rawEventId,
    };
  }

  const [raw] = await db
    .select()
    .from(rawEvents)
    .where(eq(rawEvents.id, ce.rawEventId))
    .limit(1);
  if (!raw) return null;

  const parsed = postEventBodySchema.safeParse(raw.payload);
  if (!parsed.success) return null;

  const body = parsed.data;
  const unitRows = await db
    .select({
      proofId: proofUnits.proofId,
      angle: proofUnits.angle,
      status: proofUnits.status,
      deltaCode: proofUnits.deltaCode,
      evidenceJson: proofUnits.evidenceJson,
    })
    .from(proofUnits)
    .where(eq(proofUnits.eventId, ce.eventId))
    .orderBy(asc(proofUnits.angle));

  const [flRow] = await db
    .select({ c: count() })
    .from(failureLocatorRecords)
    .innerJoin(proofUnits, eq(failureLocatorRecords.proofId, proofUnits.proofId))
    .where(eq(proofUnits.eventId, ce.eventId));

  const proof_units: PipelineProofUnit[] = unitRows.map(mapProofUnitRow);
  const lineage = buildLineageFromCanonicalEvent(
    {
      eventId: ce.eventId,
      eventLineageId: ce.eventLineageId,
      eventVersion: ce.eventVersion,
      canonicalHash: ce.canonicalHash,
      artifactId: ce.artifactId,
      subjectId: ce.subjectId,
      eventType: ce.eventType,
      traceId: ce.traceId,
      occurredAt: ce.occurredAt,
      lineageStatus: ce.lineageStatus,
      lineageReason: ce.lineageReason,
      matchedPriorEventId: ce.matchedPriorEventId,
      matchedPriorVersion: ce.matchedPriorVersion,
      resolverArtifactHash: ce.resolverArtifactHash,
      resolverOccurrenceHash: ce.resolverOccurrenceHash,
    },
    body
  );

  const [subRow] = await db
    .select({ externalKey: subjects.externalKey })
    .from(subjects)
    .where(eq(subjects.id, ce.subjectId))
    .limit(1);

  const pipeline: ProcessEventSuccess = {
    ok: true,
    source_type_key: body.source_type_key,
    raw_event_id: raw.id,
    event_id: ce.eventId,
    canonical_event_type: ce.eventType,
    subject_rail: ce.railType as RailType,
    subject_external_key: subRow?.externalKey ?? null,
    proof_units,
    failure_locators_created: Number(flRow?.c ?? 0),
    lineage_anomaly: null,
    lineage,
    proof_build_received_at: ce.createdAt ?? new Date(),
  };

  const receivedAt = pipeline.proof_build_received_at;
  const baselineControlByAngle = await loadBaselineControlSnapshot(db, {
    subjectId: ce.subjectId,
    organizationId: params.organizationId,
    environmentId: params.environmentId,
  });
  const product_proof = buildProductProof({ body, pipeline, receivedAt, baselineControlByAngle });
  await applyPersistedAnchorToProductProof(db, ce.eventId, product_proof);
  const failure_intelligence = buildFailureRollup(product_proof, pipeline);
  const identity = canonicalIdentityContractFromCanonicalRow(ce);

  const envelope: Record<string, unknown> = {
    ...pipeline,
    identity,
    product_proof,
    failure_intelligence,
  };

  finalizeEnvelopeProductProof(envelope);

  return { ok: true, envelope };
}

export async function fetchIdentityForEvent(
  db: Db,
  params: { eventId: string; organizationId: string; environmentId: string }
): Promise<ApiIdentitySnapshot | null> {
  const [ce] = await db
    .select({
      eventId: canonicalEvents.eventId,
      artifactId: canonicalEvents.artifactId,
      eventLineageId: canonicalEvents.eventLineageId,
      eventVersion: canonicalEvents.eventVersion,
      canonicalHash: canonicalEvents.canonicalHash,
      logicalHash: canonicalEvents.logicalHash,
    })
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.eventId, params.eventId),
        eq(canonicalEvents.organizationId, params.organizationId),
        eq(canonicalEvents.environmentId, params.environmentId)
      )
    )
    .limit(1);

  if (!ce) return null;
  return canonicalIdentityContractFromCanonicalRow(ce);
}

export type FailureListItem = {
  id: string;
  proof_id: string;
  event_id: string;
  angle: string;
  failure_zone: string;
  subject: string;
  host: string;
  inspection_path: string;
  created_at: string;
};

export async function listFailureLocatorsForScope(
  db: Db,
  params: {
    organizationId: string;
    environmentId: string;
    subjectId?: string;
    limit: number;
    offset: number;
  }
): Promise<{ items: FailureListItem[]; total: number }> {
  const whereParts = [
    eq(canonicalEvents.organizationId, params.organizationId),
    eq(canonicalEvents.environmentId, params.environmentId),
  ];
  if (params.subjectId !== undefined) {
    whereParts.push(eq(canonicalEvents.subjectId, params.subjectId));
  }
  const whereScope = and(...whereParts);

  const [countRow] = await db
    .select({ c: count() })
    .from(failureLocatorRecords)
    .innerJoin(proofUnits, eq(failureLocatorRecords.proofId, proofUnits.proofId))
    .innerJoin(canonicalEvents, eq(proofUnits.eventId, canonicalEvents.eventId))
    .where(whereScope);

  const total = Number(countRow?.c ?? 0);

  const rows = await db
    .select({
      id: failureLocatorRecords.id,
      proofId: failureLocatorRecords.proofId,
      eventId: proofUnits.eventId,
      angle: failureLocatorRecords.angle,
      failureZone: failureLocatorRecords.failureZone,
      subject: failureLocatorRecords.subject,
      host: failureLocatorRecords.host,
      inspectionPath: failureLocatorRecords.inspectionPath,
      createdAt: failureLocatorRecords.createdAt,
    })
    .from(failureLocatorRecords)
    .innerJoin(proofUnits, eq(failureLocatorRecords.proofId, proofUnits.proofId))
    .innerJoin(canonicalEvents, eq(proofUnits.eventId, canonicalEvents.eventId))
    .where(whereScope)
    .orderBy(desc(failureLocatorRecords.createdAt))
    .limit(params.limit)
    .offset(params.offset);

  const items: FailureListItem[] = rows.map((r) => ({
    id: r.id,
    proof_id: r.proofId,
    event_id: r.eventId,
    angle: r.angle,
    failure_zone: r.failureZone,
    subject: r.subject,
    host: r.host,
    inspection_path: r.inspectionPath,
    created_at: r.createdAt.toISOString(),
  }));

  return { items, total };
}

export async function listEventIdsForSubject(
  db: Db,
  params: {
    organizationId: string;
    environmentId: string;
    subjectId: string;
    limit: number;
    offset: number;
  }
): Promise<{ eventIds: string[]; total: number }> {
  const whereScope = and(
    eq(canonicalEvents.organizationId, params.organizationId),
    eq(canonicalEvents.environmentId, params.environmentId),
    eq(canonicalEvents.subjectId, params.subjectId),
    eq(canonicalEvents.proofability, "proofable")
  );

  const [countRow] = await db
    .select({ c: count() })
    .from(canonicalEvents)
    .where(whereScope);

  const total = Number(countRow?.c ?? 0);

  const rows = await db
    .select({ eventId: canonicalEvents.eventId })
    .from(canonicalEvents)
    .where(whereScope)
    .orderBy(desc(canonicalEvents.occurredAt), desc(canonicalEvents.eventId))
    .limit(params.limit)
    .offset(params.offset);

  return { eventIds: rows.map((r) => r.eventId), total };
}
