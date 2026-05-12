import { eq } from "drizzle-orm";
import { evaluateDeterministicIntegrity } from "../angles/deterministic-integrity.js";
import { evaluateCrossSystemIntegrity } from "../angles/cross-system-integrity.js";
import { evaluateModelIdentityIntegrity } from "../angles/model-identity-integrity.js";
import { evaluateOperationalIntegrity } from "../angles/operational-integrity.js";
import { evaluateRetrievalIntegrity } from "../angles/retrieval-integrity.js";
import type { Db } from "../db/client.js";
import { proofUnits } from "../db/schema/index.js";
import type { RailType } from "../protocol/angle-applicability.js";
import type { AngleName } from "../product/product-proof.js";
import { buildInitialBaselineDefinition } from "../baselines/angle-control.js";
import { normalizeCanonicalEventType } from "../protocol/event-aliases.js";
import { stableStringify } from "../protocol/event-hashing.js";
import { REASON_CODE } from "../protocol/proof-vocabulary.js";
import { PIPELINE_PROOF_ANGLE_ORDER } from "./active-angles.js";
import { resolveEventIdentity } from "./identity-resolver.js";
import { evaluateIdentityAccessIntegrityMvp } from "./identity-access-evaluator.js";
import { evaluatePolicyIntegrityMvp } from "./policy-evaluator.js";
import type { PostEventBody } from "../http/events-schema.js";
import { deriveAllAngleBaselines } from "../baselines/baseline-registry.js";
import {
  checkDuplicateContracts,
  computeHashes,
  detectLineageAnomaly,
  insertCanonicalEvent,
  insertRawEvent,
  payloadHost,
  persistFailureLocatorIfNeeded,
  persistProofUnit,
  resolveAngleBaseline,
  resolveArtifactCandidateMatch,
  resolveLineageAndGate,
  resolveSubjectAndMapping,
  unitDiff,
} from "./process-event-helpers.js";

export type PipelineProofUnit = {
  proof_id: string;
  status: "conformant" | "flagged" | "violated" | "unverifiable";
  angle:
    | "deterministic_integrity"
    | "policy_integrity"
    | "identity_access_integrity"
    | "operational_integrity"
    | "model_identity_integrity"
    | "retrieval_integrity"
    | "cross_system_integrity";
  delta_code: string | null;
  baseline_snapshot?: Record<string, unknown> | null;
  diff?: {
    delta_detected: boolean;
    delta_type: "none" | "drift" | "violation" | "missing" | "unknown";
    diff_summary: string | null;
    compared_fields?: string[];
    changed_fields?: string[];
  };
  evidence_refs?: string[];
};

export type ProcessEventSuccess = {
  ok: true;
  source_type_key: string;
  raw_event_id: string;
  event_id: string;
  canonical_event_type: string;
  subject_rail: RailType;
  /** Subject `external_key` when present (e.g. `zerion-agent` for Zerion Agent demo baselines). */
  subject_external_key: string | null;
  proof_units: PipelineProofUnit[];
  failure_locators_created: number;
  lineage_anomaly: "OUT_OF_ORDER_LINEAGE_VERSION" | null;
  lineage: import("../product/lineage-resolver.js").LineageResolutionResult;
  proof_build_received_at: Date;
};

export type ProcessEventFailure = {
  ok: false;
  raw_event_id: string;
  code: "NOT_PROOFABLE" | "AUTH" | "SCOPE";
  reason: string;
};

export type ProcessEventResult = ProcessEventSuccess | ProcessEventFailure;

export async function processEvent(db: Db, body: PostEventBody): Promise<ProcessEventResult> {
  return db.transaction(async (tx) => {
    /* ---- resolve subject + mapping ---- */
    const { subjRows, mapRows, normalizedCanonicalEventType } =
      await resolveSubjectAndMapping(tx, body);

    const resolvedIdentity = resolveEventIdentity(body, {
      canonical_event_type: normalizedCanonicalEventType,
    });
    const eventId = resolvedIdentity.event_id;

    /* ---- insert raw event ---- */
    const { rawEventId, rawPayloadHash } = await insertRawEvent(
      tx, body, resolvedIdentity, normalizedCanonicalEventType,
    );

    const mappingFound = mapRows.length === 1;
    if (!mappingFound || !normalizedCanonicalEventType) {
      return {
        ok: false,
        raw_event_id: rawEventId,
        code: "NOT_PROOFABLE",
        reason: "mapping_missing",
      };
    }

    const artifactResolution = resolvedIdentity.artifact.ok
      ? resolvedIdentity.artifact
      : resolvedIdentity.artifact.reason === "ARTIFACT_ID_NOT_DERIVABLE" ||
          resolvedIdentity.artifact.reason === "ARTIFACT_IDENTITY_INSUFFICIENT"
        ? await resolveArtifactCandidateMatch(
            tx,
            body,
            normalizedCanonicalEventType,
            resolvedIdentity.artifact
          )
        : resolvedIdentity.artifact;

    if (!artifactResolution.ok) {
      return {
        ok: false,
        raw_event_id: rawEventId,
        code: "NOT_PROOFABLE",
        reason:
          artifactResolution.reason === "ARTIFACT_ID_AMBIGUOUS"
            ? "LINEAGE_AMBIGUOUS_ARTIFACT_IDENTITY"
            : artifactResolution.reason,
      };
    }

    const artifactId = artifactResolution.artifact_id;
    const eventLineageId = body.event_lineage_id ?? artifactId;

    /* ---- lineage + gate ---- */
    const lineageResult = await resolveLineageAndGate(tx, body, {
      eventId,
      eventLineageId,
      artifactId,
      rawEventId,
      normalizedCanonicalEventType,
      subjRows,
      mappingFound,
      artifactIdentitySource: artifactResolution.source,
      eventLineageProvided: typeof body.event_lineage_id === "string",
    });
    if (!lineageResult.ok) return lineageResult;
    const { lineageResolution, eventVersion } = lineageResult;

    const subject = subjRows[0]!;
    const mapping = mapRows[0]!;
    const normalizedEventType = normalizeCanonicalEventType(mapping.canonicalEventType);

    /* ---- hashes ---- */
    const occurredIso = body.occurred_at.toISOString();
    const { canonicalHash, logicalHash } = computeHashes(
      eventId, subject.id, normalizedEventType, body.payload, body.trace_id, occurredIso,
    );

    /* ---- duplicate checks ---- */
    const dupResult = await checkDuplicateContracts(tx, {
      body, rawEventId, eventId, eventLineageId, eventVersion,
      artifactId, canonicalHash, logicalHash,
    });
    if (dupResult) return dupResult;

    /* ---- lineage anomaly ---- */
    const lineageAnomaly = await detectLineageAnomaly(
      tx, body, eventLineageId, artifactId, eventVersion,
    );

    /* ---- insert canonical event ---- */
    const insertResult = await insertCanonicalEvent(tx, {
      body, rawEventId, eventId, artifactId,
      subject: { id: subject.id, railType: subject.railType },
      eventLineageId, eventVersion, rawPayloadHash,
      canonicalHash, logicalHash, normalizedEventType, lineageResolution,
      artifactResolution,
      pipelineStageJson: {
        raw_ingested: true,
        canonicalized: true,
        identity_resolved: true,
        baseline_resolved: true,
        angles_evaluated: true,
        proof_built: true,
        anchorable: true,
      },
    });
    if (!insertResult.ok) return insertResult;
    const proofBuildReceivedAt = insertResult.createdAt;

    /* ---- angle evaluation ---- */
    const rail = subject.railType as RailType;
    const baselineByAngle = deriveAllAngleBaselines({
      subjectType: rail,
      subjectExternalKey: subject.externalKey ?? null,
      canonicalEvent: { payload: (body.payload ?? {}) as Record<string, unknown>, trace_id: body.trace_id },
    });
    const proofOut: PipelineProofUnit[] = [];
    let failureLocatorsCreated = 0;
    const host = payloadHost(body.payload as Record<string, unknown>);
    const syntheticBaselineId = "00000000-0000-0000-0000-000000000000";

    for (const angle of PIPELINE_PROOF_ANGLE_ORDER) {
      const baselineRow = await resolveAngleBaseline(tx, body, subject.id, angle);
      const syntheticDef = buildInitialBaselineDefinition(rail, angle as AngleName);

      if (!baselineRow) {
        const baseForEval = { id: syntheticBaselineId, definition: syntheticDef };
        let { status, deltaCode, expectedJson, observedJson, evidenceJson, inspectionPath } = evaluateAngle(
          angle,
          baseForEval,
          body,
        );
        if (status === "unverifiable") {
          status = "conformant";
          deltaCode = nonApplicableReasonCode(angle);
        }
        const proofId = await persistProofUnit(tx, {
          eventId,
          eventLineageId,
          subjectId: subject.id,
          angle,
          rawEventId,
          canonicalEventId: eventId,
          artifactId,
          eventVersion,
          matchedPriorEventId: lineageResolution.matched_prior_event_id,
          baselineId: null,
          status,
          severity: status === "violated" ? "high" : null,
          deltaCode,
          expectedJson,
          observedJson,
          evidenceJson,
        });
        proofOut.push({ proof_id: proofId, status, angle, delta_code: deltaCode });
        const created = await persistFailureLocatorIfNeeded(tx, {
          status,
          proofId,
          subjectId: subject.id,
          host,
          angle,
          inspectionPath,
          failureZone: angle,
          eventId,
          rawEventId,
          canonicalEventId: eventId,
          eventLineageId,
          artifactId,
          reasonCode: deltaCode ?? "UNKNOWN",
          detail: `${angle} failed at ${inspectionPath}`,
          failureType: status === "violated" ? "diff_violation" : null,
          baselineRuleId: null,
          missingFields: [],
        });
        if (created) failureLocatorsCreated += 1;
        continue;
      }

      let { status, deltaCode, expectedJson, observedJson, evidenceJson, inspectionPath } = evaluateAngle(
        angle,
        baselineRow,
        body,
      );

      if (status === "unverifiable") {
        status = "conformant";
        deltaCode = nonApplicableReasonCode(angle);
      }

      const proofId = await persistProofUnit(tx, {
        eventId,
        eventLineageId,
        subjectId: subject.id,
        angle,
        rawEventId,
        canonicalEventId: eventId,
        artifactId,
        eventVersion,
        matchedPriorEventId: lineageResolution.matched_prior_event_id,
        baselineId: baselineRow.id,
        status,
        severity: status === "violated" ? "high" : null,
        deltaCode,
        expectedJson,
        observedJson,
        evidenceJson,
      });
      proofOut.push({ proof_id: proofId, status, angle, delta_code: deltaCode });

      const created = await persistFailureLocatorIfNeeded(tx, {
        status,
        proofId,
        subjectId: subject.id,
        host,
        angle,
        inspectionPath,
        failureZone: angle,
        eventId,
        rawEventId,
        canonicalEventId: eventId,
        eventLineageId,
        artifactId,
        reasonCode: deltaCode ?? "UNKNOWN",
        detail: `${angle} failed at ${inspectionPath}`,
        failureType: status === "violated" ? "diff_violation" : null,
        baselineRuleId: baselineRow.id,
        missingFields: [],
      });
      if (created) failureLocatorsCreated += 1;
    }

    /* ---- evidence enrichment pass ---- */
    for (const unit of proofOut) {
      const baseline_snapshot = baselineByAngle[unit.angle] ?? null;
      const diff = unitDiff(unit.status, unit.delta_code);
      const [existing] = await tx
        .select({ evidenceJson: proofUnits.evidenceJson })
        .from(proofUnits)
        .where(eq(proofUnits.proofId, unit.proof_id))
        .limit(1);
      const evidenceBase =
        existing?.evidenceJson && typeof existing.evidenceJson === "object"
          ? (existing.evidenceJson as Record<string, unknown>)
          : {};
      await tx
        .update(proofUnits)
        .set({
          evidenceJson: {
            ...evidenceBase,
            evidence_records: [
              {
                evidence_id: `ev_canonical_${eventId}`,
                kind: "canonical_event",
                ref_id: eventId,
                summary: "canonical event",
                timestamp: occurredIso,
                source: "system",
              },
              {
                evidence_id: `ev_proof_unit_${unit.proof_id}`,
                kind: "proof_unit",
                ref_id: unit.proof_id,
                summary: `${unit.angle} proof unit`,
                timestamp: occurredIso,
                source: "system",
              },
            ],
            baseline_snapshot,
            diff,
          } as object,
        })
        .where(eq(proofUnits.proofId, unit.proof_id));
      unit.baseline_snapshot = baseline_snapshot as unknown as Record<string, unknown>;
      unit.diff = diff;
      unit.evidence_refs = [`ev_canonical_${eventId}`, `ev_proof_unit_${unit.proof_id}`];
    }

    return {
      ok: true,
      source_type_key: body.source_type_key,
      raw_event_id: rawEventId,
      event_id: eventId,
      canonical_event_type: normalizedEventType,
      subject_rail: subject.railType as RailType,
      subject_external_key: subject.externalKey ?? null,
      proof_units: proofOut,
      failure_locators_created: failureLocatorsCreated,
      lineage_anomaly: lineageAnomaly,
      lineage: lineageResolution,
      proof_build_received_at: proofBuildReceivedAt,
    };
  });
}

/** For tests / hashing parity: same raw hash input the pipeline uses. */
export function envelopeStableStringify(
  body: PostEventBody,
  normalizedCanonicalEventType: string | null = null,
): string {
  return stableStringify({
    ...body,
    canonical_event_type: normalizedCanonicalEventType,
  });
}

/* ------------------------------------------------------------------ */
/* Per-angle evaluation dispatch (preserves exact evaluator logic)     */
/* ------------------------------------------------------------------ */

type AngleEvalResult = {
  status: PipelineProofUnit["status"];
  deltaCode: string | null;
  expectedJson: Record<string, unknown> | null;
  observedJson: Record<string, unknown> | null;
  evidenceJson: Record<string, unknown>;
  inspectionPath: string;
};

function evaluateAngle(
  angle: PipelineProofUnit["angle"],
  baseline: { id: string; definition: unknown },
  body: PostEventBody,
): AngleEvalResult {
  const def = baseline.definition as Record<string, unknown>;
  const payload = body.payload as Record<string, unknown>;

  switch (angle) {
    case "deterministic_integrity":
      return evaluateDeterministicAngle(def, payload);
    case "policy_integrity":
      return evaluatePolicyAngle(baseline.definition, payload);
    case "identity_access_integrity":
      return evaluateIdentityAccessAngle(baseline.definition, payload);
    case "operational_integrity":
      return evaluateOperationalAngle(def, payload);
    case "model_identity_integrity":
      return evaluateModelIdentityAngle(def, payload);
    case "retrieval_integrity":
      return evaluateRetrievalAngle(def, payload);
    case "cross_system_integrity":
      return evaluateCrossSystemAngle(def, payload);
  }
}

function evaluateDeterministicAngle(
  def: Record<string, unknown>,
  payload: Record<string, unknown>,
): AngleEvalResult {
  const deterministic = payload.deterministic;
  const deterministicRecord =
    deterministic && typeof deterministic === "object"
      ? (deterministic as Record<string, unknown>)
      : null;
  const observedDigestRaw = deterministicRecord?.observed_digest;
  const observedDigest =
    observedDigestRaw === null || typeof observedDigestRaw === "string" ? observedDigestRaw : null;

  const evalResult = evaluateDeterministicIntegrity({
    baseline: def,
    canonicalEvent: { observed_digest: observedDigest },
  });

  return {
    status: evalResult.status,
    deltaCode: evalResult.reason_code,
    expectedJson: {
      expected_digest: typeof def.expected_digest === "string" ? def.expected_digest : null,
      algorithm: def.algorithm === "sha256" ? def.algorithm : null,
      require_exact_match: typeof def.require_exact_match === "boolean" ? def.require_exact_match : null,
    },
    observedJson: { observed_digest: observedDigest },
    evidenceJson: { summary: evalResult.summary, evidence_refs: evalResult.evidence_refs },
    inspectionPath: "payload.deterministic",
  };
}

function evaluatePolicyAngle(
  definition: unknown,
  payload: Record<string, unknown>,
): AngleEvalResult {
  const evalResult = evaluatePolicyIntegrityMvp(definition, payload);
  return {
    status: evalResult.status,
    deltaCode: evalResult.deltaCode,
    expectedJson: evalResult.expectedJson,
    observedJson: evalResult.observedJson,
    evidenceJson: evalResult.evidenceJson,
    inspectionPath: "payload.policy.tags",
  };
}

function evaluateIdentityAccessAngle(
  definition: unknown,
  payload: Record<string, unknown>,
): AngleEvalResult {
  const evalResult = evaluateIdentityAccessIntegrityMvp(definition, payload);
  return {
    status: evalResult.status,
    deltaCode: evalResult.deltaCode,
    expectedJson: evalResult.expectedJson,
    observedJson: evalResult.observedJson,
    evidenceJson: evalResult.evidenceJson,
    inspectionPath: "payload.identity_access",
  };
}

/** Exported for unit tests: Zerion CLI success path must not stay `conformant` without a real `tx_hash`. */
export function evaluateOperationalAngle(
  def: Record<string, unknown>,
  payload: Record<string, unknown>,
): AngleEvalResult {
  const op = payload.operational;
  const expectedStatus = def.expected_status;
  const maxLatencyMs = def.max_latency_ms;
  const requireNoRuntimeError = def.require_no_runtime_error;

  let status: "conformant" | "violated" | "unverifiable" = "unverifiable";
  let deltaCode: string | null = "OPERATIONAL_BASELINE_OR_PAYLOAD_SHAPE";
  let evidenceJson: Record<string, unknown> = { detail: "operational_baseline_or_payload_shape_invalid" };
  let expectedJson: Record<string, unknown> | null = null;
  let observedJson: Record<string, unknown> | null = null;

  if (
    def.type === "operational_integrity_v1" &&
    expectedStatus === "success" &&
    typeof maxLatencyMs === "number" &&
    typeof requireNoRuntimeError === "boolean" &&
    op &&
    typeof op === "object"
  ) {
    const opRecord = op as Record<string, unknown>;
    const executionStatus = opRecord.execution_status;
    const latencyMs = opRecord.latency_ms;
    const runtimeError = opRecord.runtime_error;

    if (
      (executionStatus === "success" || executionStatus === "failure") &&
      typeof latencyMs === "number" &&
      (runtimeError === null || typeof runtimeError === "string")
    ) {
      const evalResult = evaluateOperationalIntegrity({
        canonicalEvent: { execution_status: executionStatus, latency_ms: latencyMs, runtime_error: runtimeError },
        baseline: { type: "operational_integrity_v1", expected_status: expectedStatus, max_latency_ms: maxLatencyMs, require_no_runtime_error: requireNoRuntimeError },
      });
      status = evalResult.status;
      deltaCode = evalResult.reason_code;
      evidenceJson = { summary: evalResult.summary, evidence_refs: evalResult.evidence_refs };
      expectedJson = { expected_status: expectedStatus, max_latency_ms: maxLatencyMs, require_no_runtime_error: requireNoRuntimeError };
      observedJson = { execution_status: executionStatus, latency_ms: latencyMs, runtime_error: runtimeError };

      const zerion = payload.zerion;
      if (status === "conformant" && executionStatus === "success" && zerion && typeof zerion === "object") {
        const z = zerion as Record<string, unknown>;
        const src = typeof z.execution_source === "string" ? z.execution_source.trim() : "";
        if (src === "zerion_cli" || src === "zerion_cli_stub") {
          if (z.cli_invoked !== true || z.execution_attempted !== true) {
            status = "violated";
            deltaCode = "ZERION_EXECUTION_ATTESTATION_INCOMPLETE";
            evidenceJson = {
              summary:
                "Operational integrity requires Zerion CLI invocation and execution_attempted=true alongside a declared zerion_cli execution source.",
              evidence_refs: [],
            };
          } else {
            const th = z.tx_hash;
            const tx =
              typeof th === "string" && th.trim().length >= 32
                ? th.trim()
                : typeof th === "string" && th.trim().toLowerCase() === "null"
                  ? ""
                  : "";
            if (!tx) {
              status = "violated";
              deltaCode = "ZERION_TX_HASH_MISSING";
              evidenceJson = {
                summary:
                  "Operational integrity requires a Solana devnet transaction signature when Zerion CLI was invoked with a declared execution source.",
                evidence_refs: [],
              };
            }
          }
        }
      }
    }
  }

  return { status, deltaCode, expectedJson, observedJson, evidenceJson, inspectionPath: "payload.operational" };
}

function evaluateModelIdentityAngle(
  def: Record<string, unknown>,
  payload: Record<string, unknown>,
): AngleEvalResult {
  const modelIdentity = payload.model_identity;
  const modelIdentityRecord =
    modelIdentity && typeof modelIdentity === "object"
      ? (modelIdentity as Record<string, unknown>)
      : null;
  const observedModelRaw = modelIdentityRecord?.observed_model;
  const observedModel =
    observedModelRaw === null || typeof observedModelRaw === "string" ? observedModelRaw : null;

  const evalResult = evaluateModelIdentityIntegrity({
    baseline: def,
    canonicalEvent: { observed_model: observedModel },
  });

  return {
    status: evalResult.status,
    deltaCode: evalResult.reason_code,
    expectedJson: {
      expected_model: typeof def.expected_model === "string" ? def.expected_model : null,
      require_exact_match: typeof def.require_exact_match === "boolean" ? def.require_exact_match : null,
    },
    observedJson: { observed_model: observedModel },
    evidenceJson: { summary: evalResult.summary, evidence_refs: evalResult.evidence_refs },
    inspectionPath: "payload.model_identity",
  };
}

function evaluateRetrievalAngle(
  def: Record<string, unknown>,
  payload: Record<string, unknown>,
): AngleEvalResult {
  const retrieval = payload.retrieval;
  const retrievalRecord = retrieval && typeof retrieval === "object" ? (retrieval as Record<string, unknown>) : {};
  const retrievedSourcesRaw = retrievalRecord.retrieved_sources;
  const retrievedSources =
    Array.isArray(retrievedSourcesRaw) && retrievedSourcesRaw.every((s) => typeof s === "string")
      ? (retrievedSourcesRaw as string[])
      : [];

  const evalResult = evaluateRetrievalIntegrity({
    baseline: def,
    canonicalEvent: { retrieved_sources: retrievedSources },
  });

  return {
    status: evalResult.status,
    deltaCode: evalResult.reason_code,
    expectedJson: {
      expected_sources: Array.isArray(def.expected_sources) ? def.expected_sources : null,
      min_sources: typeof def.min_sources === "number" ? def.min_sources : null,
    },
    observedJson: { retrieved_sources: retrievedSources },
    evidenceJson: { summary: evalResult.summary, evidence_refs: evalResult.evidence_refs },
    inspectionPath: "payload.retrieval",
  };
}

function nonApplicableReasonCode(angle: PipelineProofUnit["angle"]): string {
  switch (angle) {
    case "retrieval_integrity":
      return REASON_CODE.NO_RETRIEVAL_EXPECTED;
    case "model_identity_integrity":
      return REASON_CODE.NO_MODEL_EXPECTED;
    case "cross_system_integrity":
      return REASON_CODE.NO_CROSS_SYSTEM_DEPENDENCIES;
    default:
      return REASON_CODE.NOT_APPLICABLE_VALID;
  }
}

function evaluateCrossSystemAngle(
  def: Record<string, unknown>,
  payload: Record<string, unknown>,
): AngleEvalResult {
  const crossSystem = payload.cross_system;
  const crossSystemRecord =
    crossSystem && typeof crossSystem === "object" ? (crossSystem as Record<string, unknown>) : {};
  const observedSystemsRaw = crossSystemRecord.observed_systems;
  const observedSystems =
    Array.isArray(observedSystemsRaw) && observedSystemsRaw.every((s) => typeof s === "string")
      ? (observedSystemsRaw as string[])
      : [];

  const evalResult = evaluateCrossSystemIntegrity({
    baseline: def,
    canonicalEvent: { observed_systems: observedSystems },
  });

  return {
    status: evalResult.status,
    deltaCode: evalResult.reason_code,
    expectedJson: {
      expected_systems: Array.isArray(def.expected_systems) ? def.expected_systems : null,
      require_all_systems: typeof def.require_all_systems === "boolean" ? def.require_all_systems : null,
    },
    observedJson: { observed_systems: observedSystems },
    evidenceJson: { summary: evalResult.summary, evidence_refs: evalResult.evidence_refs },
    inspectionPath: "payload.cross_system",
  };
}
