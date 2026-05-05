/**
 * Events read service: list and detail for canonical events.
 */
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { canonicalEvents, failureLocatorRecords, proofUnits, rawEvents } from "../db/schema/index.js";

export type EventFailureRef = {
  failure_id: string;
  angle: string;
  reason_code: string;
};

export type EventListItem = {
  event_id: string;
  raw_event_id: string;
  artifact_id: string;
  event_lineage_id: string;
  /** Alias of `event_lineage_id` for UI traceability panels. */
  lineage_id: string;
  version: number;
  source_type: string;
  ingestion_source: string | null;
  canonical_event_type: string;
  timestamp: string;
  /** ISO-8601 occurrence time (alias of `timestamp` for table views). */
  occurred_at: string;
  canonical_hash: string;
  occurrence_hash: string | null;
  idempotency_key: string | null;
  proof_id: string | null;
  linked_proof_refs: { proof_id: string | null }[];
  related_failure_refs: EventFailureRef[];
};

export type EventDetail = {
  event_id: string;
  subject_id: string;
  occurred_at: string;
  artifact_id: string;
  source_type: string;
  lineage_id: string;
  canonical_event_type: string;
  linked_proof_refs: { proof_id: string | null }[];
  related_failure_refs: EventFailureRef[];
  /** Canonical JSON payload as stored after normalization. */
  canonicalized_representation: unknown;
  metadata: Record<string, unknown>;
  raw_payload: unknown;
  canonical_form: unknown;
  identity_resolution: {
    artifact_id: string;
    identity_status: "EXACT_MATCH" | "DERIVED" | "AMBIGUOUS" | "NEW";
    identity_source: string | null;
    stable_identity_fields: string[];
    derivation_rule_id: string | null;
    confidence: string | null;
    metadata: Record<string, unknown>;
  };
  lineage_assignment: {
    event_lineage_id: string;
    version: number;
    lineage_reason: string;
    metadata: Record<string, unknown>;
  };
  state_hashes: {
    occurrence_hash: string | null;
    canonical_hash: string;
    metadata: Record<string, unknown>;
  };
  linked_proof: {
    proof_id: string | null;
    metadata: Record<string, unknown>;
  };
  pipeline_metadata: {
    raw_ingested: boolean;
    canonicalized: boolean;
    identity_resolved: boolean;
    baseline_resolved: boolean;
    angles_evaluated: boolean;
    proof_built: boolean;
    anchorable: boolean;
    metadata: Record<string, unknown>;
  };
};

function deriveIdentityStatus(source: string | null, quality: string | null): EventDetail["identity_resolution"]["identity_status"] {
  if (source === "provided" || source === "provided_validated") return "EXACT_MATCH";
  if (source === "derived" || quality === "derived_strong" || quality === "derived_generic" || quality === "explicit") return "DERIVED";
  if (quality === "ambiguous" || quality === "insufficient") return "AMBIGUOUS";
  return "NEW";
}

function parsePipelineStage(raw: unknown): EventDetail["pipeline_metadata"] {
  const ps = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    raw_ingested: ps.raw_ingested === true,
    canonicalized: ps.canonicalized === true,
    identity_resolved: ps.identity_resolved === true,
    baseline_resolved: ps.baseline_resolved === true,
    angles_evaluated: ps.angles_evaluated === true,
    proof_built: ps.proof_built === true,
    anchorable: ps.anchorable === true,
    metadata: {},
  };
}

export async function listEventsForSubject(
  db: Db,
  params: {
    subjectId: string;
    organizationId: string;
    environmentId: string;
    limit: number;
    offset: number;
  }
): Promise<{ items: EventListItem[]; total: number }> {
  const scope = and(
    eq(canonicalEvents.subjectId, params.subjectId),
    eq(canonicalEvents.organizationId, params.organizationId),
    eq(canonicalEvents.environmentId, params.environmentId)
  );

  const [countRow] = await db
    .select({ c: count() })
    .from(canonicalEvents)
    .where(scope);
  const total = Number(countRow?.c ?? 0);

  const rows = await db
    .select({
      eventId: canonicalEvents.eventId,
      rawEventId: canonicalEvents.rawEventId,
      artifactId: canonicalEvents.artifactId,
      eventLineageId: canonicalEvents.eventLineageId,
      eventVersion: canonicalEvents.eventVersion,
      sourceTypeKey: canonicalEvents.sourceTypeKey,
      ingestionSource: canonicalEvents.ingestionSource,
      eventType: canonicalEvents.eventType,
      occurredAt: canonicalEvents.occurredAt,
      canonicalHash: canonicalEvents.canonicalHash,
      occurrenceHash: canonicalEvents.occurrenceHash,
      idempotencyKey: canonicalEvents.idempotencyKey,
    })
    .from(canonicalEvents)
    .where(scope)
    .orderBy(desc(canonicalEvents.occurredAt), desc(canonicalEvents.eventId))
    .limit(params.limit)
    .offset(params.offset);

  const eventIds = rows.map((r) => r.eventId);
  const proofsByEvent = new Map<string, string[]>();
  if (eventIds.length > 0) {
    const puRows = await db
      .select({ proofId: proofUnits.proofId, eventId: proofUnits.eventId })
      .from(proofUnits)
      .where(inArray(proofUnits.eventId, eventIds));
    for (const p of puRows) {
      const list = proofsByEvent.get(p.eventId) ?? [];
      list.push(p.proofId);
      proofsByEvent.set(p.eventId, list);
    }
    for (const [eid, ids] of proofsByEvent) {
      ids.sort((a, b) => a.localeCompare(b));
      proofsByEvent.set(eid, ids);
    }
  }

  const failuresByEvent = new Map<string, EventFailureRef[]>();
  if (eventIds.length > 0) {
    const flRows = await db
      .select({
        eventId: failureLocatorRecords.eventId,
        id: failureLocatorRecords.id,
        angle: failureLocatorRecords.angle,
        reasonCode: failureLocatorRecords.reasonCode,
      })
      .from(failureLocatorRecords)
      .where(inArray(failureLocatorRecords.eventId, eventIds));
    for (const f of flRows) {
      const list = failuresByEvent.get(f.eventId) ?? [];
      list.push({ failure_id: f.id, angle: f.angle, reason_code: f.reasonCode });
      failuresByEvent.set(f.eventId, list);
    }
  }

  const items: EventListItem[] = [];
  for (const r of rows) {
    const proofIds = proofsByEvent.get(r.eventId) ?? [];
    const primaryProofId = proofIds[0] ?? null;
    const ts = r.occurredAt.toISOString();
    const failRefs = failuresByEvent.get(r.eventId) ?? [];
    failRefs.sort((a, b) => a.failure_id.localeCompare(b.failure_id));

    items.push({
      event_id: r.eventId,
      raw_event_id: r.rawEventId,
      artifact_id: r.artifactId,
      event_lineage_id: r.eventLineageId,
      lineage_id: r.eventLineageId,
      version: r.eventVersion,
      source_type: r.sourceTypeKey,
      ingestion_source: r.ingestionSource ?? null,
      canonical_event_type: r.eventType,
      timestamp: ts,
      occurred_at: ts,
      canonical_hash: r.canonicalHash,
      occurrence_hash: r.occurrenceHash,
      idempotency_key: r.idempotencyKey,
      proof_id: primaryProofId,
      linked_proof_refs: proofIds.map((id) => ({ proof_id: id })),
      related_failure_refs: failRefs,
    });
  }

  return { items, total };
}

export async function getEventDetail(
  db: Db,
  params: { eventId: string; organizationId: string; environmentId: string }
): Promise<EventDetail | null> {
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

  const [raw] = await db
    .select({ payload: rawEvents.payload })
    .from(rawEvents)
    .where(eq(rawEvents.id, ce.rawEventId))
    .limit(1);

  const puList = await db
    .select({ proofId: proofUnits.proofId })
    .from(proofUnits)
    .where(eq(proofUnits.eventId, ce.eventId));
  const proofIds = puList.map((p) => p.proofId).sort((a, b) => a.localeCompare(b));
  const primaryProofId = proofIds[0] ?? null;

  const failureRows = await db
    .select({
      id: failureLocatorRecords.id,
      angle: failureLocatorRecords.angle,
      reasonCode: failureLocatorRecords.reasonCode,
    })
    .from(failureLocatorRecords)
    .where(eq(failureLocatorRecords.eventId, ce.eventId));
  const related_failure_refs: EventFailureRef[] = failureRows
    .map((f) => ({ failure_id: f.id, angle: f.angle, reason_code: f.reasonCode }))
    .sort((a, b) => a.failure_id.localeCompare(b.failure_id));

  const stableFields = ce.artifactStableIdentityJson
    ? Object.keys(
        typeof ce.artifactStableIdentityJson === "object"
          ? (ce.artifactStableIdentityJson as Record<string, unknown>)
          : {}
      )
    : [];

  const occurredAt = ce.occurredAt.toISOString();

  return {
    event_id: ce.eventId,
    subject_id: ce.subjectId,
    occurred_at: occurredAt,
    artifact_id: ce.artifactId,
    source_type: ce.sourceTypeKey,
    lineage_id: ce.eventLineageId,
    canonical_event_type: ce.eventType,
    linked_proof_refs: proofIds.map((id) => ({ proof_id: id })),
    related_failure_refs,
    canonicalized_representation: ce.payload,
    metadata: {},
    raw_payload: raw?.payload ?? null,
    canonical_form: ce.payload,
    identity_resolution: {
      artifact_id: ce.artifactId,
      identity_status: deriveIdentityStatus(
        ce.artifactIdentitySource,
        ce.artifactIdentityQuality
      ),
      identity_source: ce.artifactIdentitySource ?? null,
      stable_identity_fields: stableFields,
      derivation_rule_id: ce.artifactIdentityRuleId ?? null,
      confidence: ce.artifactIdentityConfidence ?? null,
      metadata: {},
    },
    lineage_assignment: {
      event_lineage_id: ce.eventLineageId,
      version: ce.eventVersion,
      lineage_reason: ce.lineageReason,
      metadata: {},
    },
    state_hashes: {
      occurrence_hash: ce.occurrenceHash,
      canonical_hash: ce.canonicalHash,
      metadata: {},
    },
    linked_proof: {
      proof_id: primaryProofId,
      metadata: {},
    },
    pipeline_metadata: parsePipelineStage(ce.pipelineStageJson),
  };
}
