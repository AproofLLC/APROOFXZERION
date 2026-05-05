/**
 * Internal helpers extracted from process-event.ts.
 * These preserve exact pipeline semantics — no logic changes.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  canonicalEvents,
  failureLocatorRecords,
  mappingRules,
  proofUnits,
  rawEvents,
  subjects,
} from "../db/schema/index.js";
import { normalizeCanonicalEventType } from "../protocol/event-aliases.js";
import {
  canonicalHashFields,
  logicalHashFields,
  rawPayloadHashFromPayload,
  stableStringify,
} from "../protocol/event-hashing.js";
import { resolveEventIdentity } from "./identity-resolver.js";
import {
  compatibleSourceTypeSearchOrder,
  stableIdentityMapsEqual,
  type ArtifactIdentityResolution,
} from "./artifact-identity.js";
import {
  resolveClientEventVersionLineage,
  resolveEventLineage,
  type LineageResolutionResult,
} from "../product/lineage-resolver.js";
import { runProofabilityGate } from "./proofability-gate.js";
import { classifyLineageVersionAgainstExisting } from "./identity-rules.js";
import { buildFailureLocatorFields } from "./failure-locator.js";
import { resolveBaselineAt } from "./baseline-resolve.js";
import type { PostEventBody } from "../http/events-schema.js";
import type { PipelineProofUnit, ProcessEventFailure } from "./process-event.js";
import type { IntegrityAngle } from "../protocol/angle-applicability.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/* ------------------------------------------------------------------ */
/* Typed Drizzle insert-returning helper                              */
/* ------------------------------------------------------------------ */

/**
 * Typed wrapper for Drizzle insert().returning() that handles the node-pg | pglite
 * driver union overload mismatch. Both drivers support `.returning()`; the TS
 * union just loses the overload. Semantics and SQL are identical.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drizzleReturning<TRow>(insertBuilder: any, returningCols: any): Promise<TRow[]> {
  return insertBuilder.returning(returningCols) as Promise<TRow[]>;
}

/* ------------------------------------------------------------------ */
/* Subject + mapping resolution                                       */
/* ------------------------------------------------------------------ */

export type SubjectAndMapping = {
  subjRows: Awaited<ReturnType<typeof resolveSubjectAndMapping>>["subjRows"];
  mapRows: Awaited<ReturnType<typeof resolveSubjectAndMapping>>["mapRows"];
  normalizedCanonicalEventType: string | null;
};

export async function resolveSubjectAndMapping(tx: Tx, body: PostEventBody) {
  const subjRows = await tx
    .select()
    .from(subjects)
    .where(
      and(
        eq(subjects.id, body.subject_id),
        eq(subjects.organizationId, body.organization_id),
        eq(subjects.environmentId, body.environment_id),
      ),
    )
    .limit(2);

  const mapRows = await tx
    .select()
    .from(mappingRules)
    .where(
      and(
        eq(mappingRules.organizationId, body.organization_id),
        eq(mappingRules.environmentId, body.environment_id),
        eq(mappingRules.sourceTypeKey, body.source_type_key),
        eq(mappingRules.isActive, true),
      ),
    )
    .limit(2);

  const normalizedCanonicalEventType =
    mapRows.length === 1 ? normalizeCanonicalEventType(mapRows[0]!.canonicalEventType) : null;

  return { subjRows, mapRows, normalizedCanonicalEventType };
}

/* ------------------------------------------------------------------ */
/* Raw event insertion                                                */
/* ------------------------------------------------------------------ */

export async function insertRawEvent(
  tx: Tx,
  body: PostEventBody,
  resolvedIdentity: ReturnType<typeof resolveEventIdentity>,
  normalizedCanonicalEventType: string | null,
) {
  const eventId = resolvedIdentity.event_id;
  const eventLineageId = resolvedIdentity.event_lineage_id;
  const artifactIdForRawHash = resolvedIdentity.artifact.ok
    ? resolvedIdentity.artifact.artifact_id
    : body.artifact_id ?? null;
  const rawHashInput = {
    ...body,
    event_id: eventId,
    artifact_id: artifactIdForRawHash,
    event_lineage_id: eventLineageId,
    canonical_event_type: normalizedCanonicalEventType,
  };
  const rawPayloadHash = rawPayloadHashFromPayload(rawHashInput);

  const rows = await drizzleReturning<{ id: string }>(
    tx.insert(rawEvents).values({
      organizationId: body.organization_id,
      environmentId: body.environment_id,
      payload: body as object,
      rawPayloadHash,
    }),
    { id: rawEvents.id },
  );

  return { rawEventId: rows[0]!.id, rawPayloadHash };
}

/* ------------------------------------------------------------------ */
/* Lineage resolution + gate                                          */
/* ------------------------------------------------------------------ */

export async function resolveLineageAndGate(
  tx: Tx,
  body: PostEventBody,
  params: {
    eventId: string;
    eventLineageId: string;
    artifactId: string;
    rawEventId: string;
    normalizedCanonicalEventType: string;
    subjRows: SubjectAndMapping["subjRows"];
    mappingFound: boolean;
    artifactIdentitySource?: string;
    eventLineageProvided?: boolean;
  },
): Promise<
  | { ok: true; lineageResolution: LineageResolutionResult; eventVersion: number }
  | ProcessEventFailure
> {
  let lineageResolution: LineageResolutionResult;
  try {
    if (body.event_version !== undefined) {
      lineageResolution = await resolveClientEventVersionLineage(tx, {
        event_id: params.eventId,
        event_lineage_id: params.eventLineageId,
        artifact_id: params.artifactId,
        organization_id: body.organization_id,
        environment_id: body.environment_id,
        subject_id: body.subject_id,
        canonical_event_type: params.normalizedCanonicalEventType,
        occurred_at: body.occurred_at,
        payload: body.payload,
        trace_id: body.trace_id,
        client_event_version: body.event_version,
        artifact_identity_source: params.artifactIdentitySource,
        event_lineage_provided: params.eventLineageProvided,
      });
    } else {
      lineageResolution = await resolveEventLineage(tx, {
        event_id: params.eventId,
        event_lineage_id: params.eventLineageId,
        artifact_id: params.artifactId,
        organization_id: body.organization_id,
        environment_id: body.environment_id,
        subject_id: body.subject_id,
        canonical_event_type: params.normalizedCanonicalEventType,
        occurred_at: body.occurred_at,
        payload: body.payload,
        trace_id: body.trace_id,
        artifact_identity_source: params.artifactIdentitySource,
        event_lineage_provided: params.eventLineageProvided,
      });
    }
  } catch (error) {
    const reasonRaw = (error as Error).message;
    const reason =
      reasonRaw === "lineage_artifact_identity_conflict" || reasonRaw === "LINEAGE_ARTIFACT_IDENTITY_CONFLICT"
        ? "LINEAGE_ARTIFACT_IDENTITY_CONFLICT"
        : reasonRaw === "existing_lineage_client_version_rejected"
          ? "LINEAGE_VERSION_REPLAY_REJECTED"
          : reasonRaw;
    return {
      ok: false,
      raw_event_id: params.rawEventId,
      code: "NOT_PROOFABLE",
      reason,
    };
  }

  const eventVersion = lineageResolution.event_version;

  const gate = runProofabilityGate({
    organizationId: body.organization_id,
    environmentId: body.environment_id,
    subjectId: body.subject_id,
    subjectResolvedCount: params.subjRows.length,
    mappingFound: params.mappingFound,
    eventId: params.eventId,
    eventLineageId: params.eventLineageId,
    eventVersion,
    traceId: body.trace_id,
    occurredAt: body.occurred_at,
  });

  if (!gate.ok) {
    return {
      ok: false,
      raw_event_id: params.rawEventId,
      code: "NOT_PROOFABLE",
      reason: gate.reason,
    };
  }

  return { ok: true, lineageResolution, eventVersion };
}

/* ------------------------------------------------------------------ */
/* Duplicate / conflict checks                                        */
/* ------------------------------------------------------------------ */

export async function checkDuplicateContracts(
  tx: Tx,
  params: {
    body: PostEventBody;
    rawEventId: string;
    eventId: string;
    eventLineageId: string;
    eventVersion: number;
    artifactId: string;
    canonicalHash: string;
    logicalHash: string;
  },
): Promise<ProcessEventFailure | null> {
  const {
    body, rawEventId, eventId, eventLineageId, eventVersion,
    artifactId, canonicalHash, logicalHash,
  } = params;

  if (body.idempotency_key) {
    const existingByIdempotencyKey = await tx
      .select({
        canonicalHash: canonicalEvents.canonicalHash,
      })
      .from(canonicalEvents)
      .where(
        and(
          eq(canonicalEvents.organizationId, body.organization_id),
          eq(canonicalEvents.environmentId, body.environment_id),
          eq(canonicalEvents.idempotencyKey, body.idempotency_key),
        ),
      )
      .limit(1);

    if (existingByIdempotencyKey.length === 1) {
      return {
        ok: false,
        raw_event_id: rawEventId,
        code: "NOT_PROOFABLE",
        reason:
          existingByIdempotencyKey[0]!.canonicalHash === canonicalHash
            ? "idempotency_replay_same_hash"
            : "idempotency_key_conflict",
      };
    }
  }

  const existingByLineageVersion = await tx
    .select({
      artifactId: canonicalEvents.artifactId,
      logicalHash: canonicalEvents.logicalHash,
    })
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, body.organization_id),
        eq(canonicalEvents.environmentId, body.environment_id),
        eq(canonicalEvents.eventLineageId, eventLineageId),
        eq(canonicalEvents.eventVersion, eventVersion),
      ),
    )
    .limit(1);

  const existingByEventId = await tx
    .select({
      eventId: canonicalEvents.eventId,
      canonicalHash: canonicalEvents.canonicalHash,
    })
    .from(canonicalEvents)
    .where(eq(canonicalEvents.eventId, eventId))
    .limit(1);

  const hasProvidedEventId =
    typeof body.event_id === "string" && body.event_id.trim().length > 0;

  if (hasProvidedEventId && existingByEventId.length === 1) {
    return {
      ok: false,
      raw_event_id: rawEventId,
      code: "NOT_PROOFABLE",
      reason:
        existingByEventId[0]!.canonicalHash === canonicalHash
          ? "duplicate_event_id_same_hash"
          : "duplicate_event_id_hash_conflict",
    };
  }

  if (existingByLineageVersion.length === 1) {
    return {
      ok: false,
      raw_event_id: rawEventId,
      code: "NOT_PROOFABLE",
      reason: classifyLineageVersionAgainstExisting({
        existingArtifactId: existingByLineageVersion[0]!.artifactId,
        existingLogicalHash: existingByLineageVersion[0]!.logicalHash,
        incomingArtifactId: artifactId,
        incomingLogicalHash: logicalHash,
      }),
    };
  }

  if (existingByEventId.length === 1) {
    return {
      ok: false,
      raw_event_id: rawEventId,
      code: "NOT_PROOFABLE",
      reason:
        existingByEventId[0]!.canonicalHash === canonicalHash
          ? "duplicate_event_id_same_hash"
          : "duplicate_event_id_hash_conflict",
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Canonical event insertion with post-conflict classification        */
/* ------------------------------------------------------------------ */

export async function insertCanonicalEvent(
  tx: Tx,
  params: {
    body: PostEventBody;
    rawEventId: string;
    eventId: string;
    artifactId: string;
    subject: { id: string; railType: string };
    eventLineageId: string;
    eventVersion: number;
    rawPayloadHash: string;
    canonicalHash: string;
    logicalHash: string;
    normalizedEventType: string;
    lineageResolution: LineageResolutionResult;
    artifactResolution: ArtifactIdentityResolution & { ok: true };
    pipelineStageJson: Record<string, boolean>;
  },
): Promise<
  | { ok: true; createdAt: Date }
  | ProcessEventFailure
> {
  const {
    body, rawEventId, eventId, artifactId, subject, eventLineageId,
    eventVersion, rawPayloadHash, canonicalHash, logicalHash,
    normalizedEventType, lineageResolution, artifactResolution, pipelineStageJson,
  } = params;

  const canonicalInsert = tx
    .insert(canonicalEvents)
    .values({
      eventId,
      rawEventId,
      organizationId: body.organization_id,
      environmentId: body.environment_id,
      subjectId: subject.id,
      artifactId,
      subjectType: subject.railType,
      railType: subject.railType,
      eventLineageId,
      eventVersion,
      traceId: body.trace_id,
      occurredAt: body.occurred_at,
      rawPayloadHash,
      canonicalHash,
      logicalHash,
      sourceTypeKey: body.source_type_key,
      eventType: normalizedEventType,
      payload: body.payload as object,
      proofability: "proofable",
      quarantineReason: null,
      lineageStatus: lineageResolution.lineage_status,
      lineageReason: lineageResolution.lineage_reason,
      matchedPriorEventId: lineageResolution.matched_prior_event_id,
      matchedPriorVersion: lineageResolution.matched_prior_version,
      resolverArtifactHash: lineageResolution.artifact_hash,
      resolverOccurrenceHash: lineageResolution.occurrence_hash,
      occurrenceHash: lineageResolution.occurrence_hash,
      stateHash: logicalHash,
      artifactIdentitySource: artifactResolution.source,
      artifactIdentityRuleId: artifactResolution.derivation_rule_id,
      artifactIdentityConfidence: artifactResolution.confidence,
      artifactIdentityQuality: artifactResolution.quality,
      artifactIdentityCandidateKeys: artifactResolution.candidate_keys,
      artifactIdentityCompatibleSourceMatch: artifactResolution.compatible_source_match,
      artifactStableIdentityJson: {
        fields: artifactResolution.stable_identity_fields,
        map: artifactResolution.stable_identity_map,
      },
      artifactIdentitySummary: artifactResolution.stable_identity_summary,
      idempotencyKey: body.idempotency_key ?? null,
      ingestionSource: body.ingestion_source ?? null,
      pipelineStageJson,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .onConflictDoNothing();
  const inserted = await drizzleReturning<{ eventId: string; createdAt: Date }>(
    canonicalInsert,
    { eventId: canonicalEvents.eventId, createdAt: canonicalEvents.createdAt },
  );

  if (inserted.length === 0) {
    return classifyPostConflict(tx, {
      body, rawEventId, eventId, eventLineageId, eventVersion, artifactId, canonicalHash, logicalHash,
    });
  }

  return { ok: true, createdAt: inserted[0]!.createdAt };
}

async function classifyPostConflict(
  tx: Tx,
  params: {
    body: PostEventBody;
    rawEventId: string;
    eventId: string;
    eventLineageId: string;
    eventVersion: number;
    artifactId: string;
    canonicalHash: string;
    logicalHash: string;
  },
): Promise<ProcessEventFailure> {
  const {
    body, rawEventId, eventId, eventLineageId, eventVersion,
    artifactId, canonicalHash, logicalHash,
  } = params;

  const hasProvidedEventId =
    typeof body.event_id === "string" && body.event_id.trim().length > 0;

  if (hasProvidedEventId) {
    const existingEvent = await tx
      .select({ canonicalHash: canonicalEvents.canonicalHash })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.eventId, eventId))
      .limit(1);
    if (existingEvent.length === 1) {
      return {
        ok: false,
        raw_event_id: rawEventId,
        code: "NOT_PROOFABLE",
        reason:
          existingEvent[0]!.canonicalHash === canonicalHash
            ? "duplicate_event_id_same_hash"
            : "duplicate_event_id_hash_conflict",
      };
    }
  }

  const existingLineage = await tx
    .select({
      artifactId: canonicalEvents.artifactId,
      logicalHash: canonicalEvents.logicalHash,
    })
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, body.organization_id),
        eq(canonicalEvents.environmentId, body.environment_id),
        eq(canonicalEvents.eventLineageId, eventLineageId),
        eq(canonicalEvents.eventVersion, eventVersion),
      ),
    )
    .limit(1);

  if (existingLineage.length === 1) {
    return {
      ok: false,
      raw_event_id: rawEventId,
      code: "NOT_PROOFABLE",
      reason: classifyLineageVersionAgainstExisting({
        existingArtifactId: existingLineage[0]!.artifactId,
        existingLogicalHash: existingLineage[0]!.logicalHash,
        incomingArtifactId: artifactId,
        incomingLogicalHash: logicalHash,
      }),
    };
  }

  const existingEvent = await tx
    .select({ canonicalHash: canonicalEvents.canonicalHash })
    .from(canonicalEvents)
    .where(eq(canonicalEvents.eventId, eventId))
    .limit(1);

  if (existingEvent.length === 1) {
    return {
      ok: false,
      raw_event_id: rawEventId,
      code: "NOT_PROOFABLE",
      reason:
        existingEvent[0]!.canonicalHash === canonicalHash
          ? "duplicate_event_id_same_hash"
          : "duplicate_event_id_hash_conflict",
    };
  }

  return {
    ok: false,
    raw_event_id: rawEventId,
    code: "NOT_PROOFABLE",
    reason: "duplicate_submission_conflict",
  };
}

/* ------------------------------------------------------------------ */
/* Proof unit persistence                                             */
/* ------------------------------------------------------------------ */

export async function persistProofUnit(
  tx: Tx,
  values: {
    eventId: string;
    eventLineageId: string;
    rawEventId: string;
    canonicalEventId: string;
    artifactId: string;
    eventVersion: number;
    matchedPriorEventId: string | null;
    subjectId: string;
    angle: string;
    baselineId: string | null;
    status: string;
    severity: string | null;
    deltaCode: string | null;
    expectedJson: Record<string, unknown> | null;
    observedJson: Record<string, unknown> | null;
    evidenceJson: Record<string, unknown>;
    anchorBatchId?: string | null;
  },
): Promise<string> {
  const rows = await drizzleReturning<{ proofId: string }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx.insert(proofUnits).values(values as any),
    { proofId: proofUnits.proofId },
  );
  return rows[0]!.proofId;
}

/* ------------------------------------------------------------------ */
/* Failure locator persistence                                        */
/* ------------------------------------------------------------------ */

export async function persistFailureLocatorIfNeeded(
  tx: Tx,
  params: {
    status: string;
    proofId: string;
    subjectId: string;
    host: string;
    angle: string;
    inspectionPath: string;
    failureZone: string;
    eventId: string;
    rawEventId: string;
    canonicalEventId: string;
    eventLineageId: string;
    artifactId: string;
    reasonCode: string;
    detail: string;
    failureType: string | null;
    baselineRuleId: string | null;
    missingFields: string[];
  },
): Promise<boolean> {
  if (params.status !== "violated") return false;
  const fl = buildFailureLocatorFields({
    subjectId: params.subjectId,
    host: params.host,
    angle: params.angle as IntegrityAngle,
    inspectionPath: params.inspectionPath,
    failureZone: params.failureZone,
  });
  await tx.insert(failureLocatorRecords).values({
    proofId: params.proofId,
    eventId: params.eventId,
    rawEventId: params.rawEventId,
    canonicalEventId: params.canonicalEventId,
    eventLineageId: params.eventLineageId,
    artifactId: params.artifactId,
    ...fl,
    step: "angle_evaluation",
    reasonCode: params.reasonCode,
    detail: params.detail,
    failureType: params.failureType,
    baselineRuleId: params.baselineRuleId,
    missingFields: params.missingFields,
  });
  return true;
}

/* ------------------------------------------------------------------ */
/* Baseline resolution helper                                         */
/* ------------------------------------------------------------------ */

export async function resolveAngleBaseline(
  tx: Tx,
  body: PostEventBody,
  subjectId: string,
  angle: string,
) {
  return resolveBaselineAt(tx, {
    organizationId: body.organization_id,
    environmentId: body.environment_id,
    subjectId,
    angle: angle as IntegrityAngle,
    at: body.occurred_at,
  });
}

/* ------------------------------------------------------------------ */
/* Lineage anomaly detection                                          */
/* ------------------------------------------------------------------ */

export async function detectLineageAnomaly(
  tx: Tx,
  body: PostEventBody,
  eventLineageId: string,
  artifactId: string,
  eventVersion: number,
): Promise<"OUT_OF_ORDER_LINEAGE_VERSION" | null> {
  const lineageRows = await tx
    .select({ eventVersion: canonicalEvents.eventVersion })
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, body.organization_id),
        eq(canonicalEvents.environmentId, body.environment_id),
        eq(canonicalEvents.eventLineageId, eventLineageId),
        eq(canonicalEvents.artifactId, artifactId),
      ),
    );
  const maxSeenVersion =
    lineageRows.length === 0
      ? null
      : Math.max(...lineageRows.map((r) => r.eventVersion));
  return maxSeenVersion !== null && eventVersion <= maxSeenVersion
    ? "OUT_OF_ORDER_LINEAGE_VERSION"
    : null;
}

/* ------------------------------------------------------------------ */
/* Hash computation helper                                            */
/* ------------------------------------------------------------------ */

export function computeHashes(
  eventId: string,
  subjectId: string,
  normalizedEventType: string,
  payload: Record<string, unknown>,
  traceId: string,
  occurredIso: string,
) {
  const canonical = canonicalHashFields({
    event_id: eventId,
    trace_id: traceId,
    subject_id: subjectId,
    event_type: normalizedEventType,
    occurred_at: occurredIso,
  });
  const logical = logicalHashFields({
    subject_id: subjectId,
    event_type: normalizedEventType,
    payload,
  });
  return { canonicalHash: canonical, logicalHash: logical };
}

export async function resolveArtifactCandidateMatch(
  tx: Tx,
  body: PostEventBody,
  normalizedCanonicalEventType: string,
  failedIdentity: Exclude<ArtifactIdentityResolution, { ok: true }>
): Promise<ArtifactIdentityResolution> {
  const stableFields = failedIdentity.stable_identity_fields ?? [];
  if (stableFields.length === 0) {
    return failedIdentity;
  }
  const sourceSearchOrder = compatibleSourceTypeSearchOrder(body.source_type_key);
  const incomingMap = failedIdentity.stable_identity_map ?? {};

  for (const sourceTypeKey of sourceSearchOrder) {
    const candidates = await tx
      .select({
        artifactId: canonicalEvents.artifactId,
        sourceTypeKey: canonicalEvents.sourceTypeKey,
        stable: canonicalEvents.artifactStableIdentityJson,
      })
      .from(canonicalEvents)
      .where(
        and(
          eq(canonicalEvents.organizationId, body.organization_id),
          eq(canonicalEvents.environmentId, body.environment_id),
          eq(canonicalEvents.subjectId, body.subject_id),
          eq(canonicalEvents.sourceTypeKey, sourceTypeKey),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          eq(canonicalEvents.eventType, normalizedCanonicalEventType as any),
        )
      );

    const exact = candidates.filter((c) => {
      const stableObj =
        c.stable && typeof c.stable === "object" ? (c.stable as Record<string, unknown>) : {};
      const stableMap =
        stableObj.map && typeof stableObj.map === "object"
          ? (stableObj.map as Record<string, unknown>)
          : stableObj;
      return stableIdentityMapsEqual(stableMap, incomingMap);
    });
    const uniqueArtifactIds = [...new Set(exact.map((e) => e.artifactId))];
    if (uniqueArtifactIds.length === 1) {
      return {
        ok: true,
        artifact_id: uniqueArtifactIds[0]!,
        source: "candidate_match",
        stable_identity_fields: [...stableFields].sort(),
        stable_identity_map: incomingMap,
        stable_identity_summary: stableStringify(incomingMap),
        derivation_rule_id: failedIdentity.derivation_rule_id,
        candidate_keys: failedIdentity.candidate_keys ?? [],
        quality: "candidate_match_exact",
        compatible_source_match: sourceTypeKey === body.source_type_key ? null : sourceTypeKey,
        confidence: "high",
      };
    }
    if (uniqueArtifactIds.length > 1) {
      return {
        ok: false,
        reason: "ARTIFACT_ID_AMBIGUOUS",
        stable_identity_fields: [...stableFields].sort(),
        stable_identity_map: incomingMap,
        derivation_rule_id: failedIdentity.derivation_rule_id,
        candidate_keys: failedIdentity.candidate_keys ?? [],
        quality: "ambiguous",
        compatible_source_match: sourceTypeKey === body.source_type_key ? null : sourceTypeKey,
        detail: "multiple exact candidate artifacts matched stable identity map",
      };
    }
    if (sourceTypeKey === body.source_type_key) {
      continue;
    }
  }
  return {
    ok: false,
    reason: "ARTIFACT_IDENTITY_INSUFFICIENT",
    stable_identity_fields: [...stableFields].sort(),
    stable_identity_map: incomingMap,
    derivation_rule_id: failedIdentity.derivation_rule_id,
    candidate_keys: failedIdentity.candidate_keys ?? [],
    quality: "insufficient",
    compatible_source_match: null,
    detail: "no deterministic prior artifact candidate matched stable identity map",
  };
}

export function payloadHost(payload: Record<string, unknown>): string {
  const h = payload.host;
  return typeof h === "string" && h.trim() ? h : "unspecified";
}

export function unitDiff(
  status: PipelineProofUnit["status"],
  reasonCode: string | null,
): NonNullable<PipelineProofUnit["diff"]> {
  if (status === "conformant")
    return { delta_detected: false, delta_type: "none", diff_summary: null };
  if (reasonCode === "BASELINE_MISSING" || reasonCode === "NO_BASELINE_SOURCE") {
    return { delta_detected: true, delta_type: "missing", diff_summary: reasonCode };
  }
  if (status === "violated") {
    return { delta_detected: true, delta_type: "violation", diff_summary: reasonCode ?? "violation" };
  }
  if (status === "flagged") {
    return { delta_detected: true, delta_type: "drift", diff_summary: reasonCode ?? "drift" };
  }
  return { delta_detected: true, delta_type: "unknown", diff_summary: reasonCode ?? "insufficient_context" };
}
