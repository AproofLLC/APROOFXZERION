import { createHash } from "node:crypto";
import type { AngleControlState } from "../baselines/angle-control.js";
import type { PostEventBody } from "../http/events-schema.js";
import type { ProcessEventSuccess } from "../pipeline/process-event.js";
import type { RailType } from "../protocol/angle-applicability.js";
import type { LineageResolutionResult } from "./lineage-resolver.js";
import {
  type AngleName,
  type ProductAngleResult,
  type ProductFlag,
  type ProductProof,
  type ProofStatus,
  type SubjectType,
  deriveFlagsCount,
  deriveHighestSeverity,
  deriveProofStatus,
} from "./product-proof.js";
import {
  finalizeProofAnglesOrThrow,
} from "./universal-contract.js";
import { computeProofDigest, toHashableProofPayload } from "./proof-digest.js";
import { selectFailureLocatorFromProof } from "./failure-locator.js";
import { deriveAllAngleBaselines } from "../baselines/baseline-registry.js";
import { SOLANA_SANDBOX_ROUTE } from "../anchor/sandbox-anchor-constants.js";
import { REASON_CODE } from "../protocol/proof-vocabulary.js";
import { resolveAngleOutcomeSemantics, deriveProofSufficiency } from "./proof-semantic-law.js";
import { zerionExecutionExplorerUrlFromTxHash } from "../zerion/zerion-execution-explorer-url.js";

export const DEFAULT_CANONICALIZATION_VERSION = "0.1.0";

/** Stable synthetic flag id so proof_digest is identical across POST and repeated GET reconstruction. */
function deterministicFlagId(angle: string, code: string, proofRef: string): string {
  return createHash("sha256").update(`${angle}\0${code}\0${proofRef}`, "utf8").digest("hex").slice(0, 32);
}
export const DEFAULT_VERIFIER_VERSION = "0.1.0";

/**
 * Typed error for proof input validation failures.
 * Signals that required proof-building input is missing or invalid.
 */
export class ProductProofInputError extends Error {
  code: string;
  detail?: string;

  constructor(code: string, detail?: string) {
    super(`ProductProof input error: ${code}${detail ? ` (${detail})` : ""}`);
    this.name = "ProductProofInputError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Shared event identity shape consumed by buildProductProof.
 * All fields required; fail early if any are missing.
 */
export interface ProofEventIdentity {
  event_id: string;
  event_lineage_id: string;
  event_version: number;
  artifact_id: string;
  lineage_status: "new_lineage" | "existing_lineage_same_state" | "existing_lineage_new_version";
  lineage_reason: string;
  canonical_hash: string;
  artifact_hash: string | null;
  occurrence_hash: string | null;
}

export type BuildProductProofInput = {
  body: PostEventBody;
  pipeline: ProcessEventSuccess;
  receivedAt: Date;
  canonicalizationVersion?: string;
  verifierVersion?: string;
  policyVersion?: string | null;
  baselineVersion?: string | null;
  /** Latest DB-backed angle_control per angle (optional; strengthens legacy reads and metadata). */
  baselineControlByAngle?: Partial<Record<AngleName, AngleControlState>>;
};

/** No evaluable sources / evidence for this angle for the given event type. */
export const NO_SOURCES_REASON = "NO_SOURCES" as const;
export const NOT_APPLICABLE_REASON = "NOT_APPLICABLE" as const;

/** Extract and validate event identity from lineage resolution. */
export function validateAndExtractEventIdentity(lineage: LineageResolutionResult): ProofEventIdentity {
  if (!lineage) {
    throw new ProductProofInputError("EVENT_IDENTITY_REQUIRED", "lineage block missing");
  }
  if (!lineage.event_id || typeof lineage.event_id !== "string") {
    throw new ProductProofInputError("EVENT_IDENTITY_INCOMPLETE", "event_id");
  }
  if (!lineage.event_lineage_id || typeof lineage.event_lineage_id !== "string") {
    throw new ProductProofInputError("EVENT_IDENTITY_INCOMPLETE", "event_lineage_id");
  }
  if (typeof lineage.event_version !== "number" || lineage.event_version < 1) {
    throw new ProductProofInputError("EVENT_IDENTITY_INCOMPLETE", "event_version");
  }
  if (!lineage.artifact_id || typeof lineage.artifact_id !== "string") {
    throw new ProductProofInputError("EVENT_IDENTITY_INCOMPLETE", "artifact_id");
  }
  if (!lineage.lineage_status || typeof lineage.lineage_status !== "string") {
    throw new ProductProofInputError("EVENT_IDENTITY_INCOMPLETE", "lineage_status");
  }
  if (lineage.lineage_reason === null || lineage.lineage_reason === undefined || typeof lineage.lineage_reason !== "string") {
    throw new ProductProofInputError("EVENT_IDENTITY_INCOMPLETE", "lineage_reason");
  }
  if (!lineage.canonical_hash || typeof lineage.canonical_hash !== "string") {
    throw new ProductProofInputError("EVENT_IDENTITY_INCOMPLETE", "canonical_hash");
  }
  if (lineage.artifact_hash !== null && lineage.artifact_hash !== undefined && typeof lineage.artifact_hash !== "string") {
    throw new ProductProofInputError("EVENT_IDENTITY_INCOMPLETE", "artifact_hash");
  }
  if (lineage.occurrence_hash !== null && lineage.occurrence_hash !== undefined && typeof lineage.occurrence_hash !== "string") {
    throw new ProductProofInputError("EVENT_IDENTITY_INCOMPLETE", "occurrence_hash");
  }

  return {
    event_id: lineage.event_id,
    event_lineage_id: lineage.event_lineage_id,
    event_version: lineage.event_version,
    artifact_id: lineage.artifact_id,
    lineage_status: lineage.lineage_status as ProofEventIdentity["lineage_status"],
    lineage_reason: lineage.lineage_reason,
    canonical_hash: lineage.canonical_hash,
    artifact_hash: lineage.artifact_hash ?? null,
    occurrence_hash: lineage.occurrence_hash ?? null,
  };
}

/**
 * Shared entry point: resolved or persisted lineage → proof builder event identity.
 * Use from write and read paths so field rules stay aligned.
 */
export function buildProofEventIdentity(lineage: LineageResolutionResult): ProofEventIdentity {
  return validateAndExtractEventIdentity(lineage);
}

/** Validate a plain event identity object (same rules as lineage-derived identity). */
export function validateProofEventIdentityBlock(event: ProofEventIdentity): ProofEventIdentity {
  return validateAndExtractEventIdentity({
    ...event,
    matched_prior_event_id: null,
    matched_prior_version: null,
  } as LineageResolutionResult);
}

function missingUnitReasonCode(angle: AngleName, canonicalEventType: string): string {
  if (angle === "retrieval_integrity" && canonicalEventType !== "retrieval_completed") {
    return NO_SOURCES_REASON;
  }
  if (
    (angle === "deterministic_integrity" ||
      angle === "operational_integrity" ||
      angle === "model_identity_integrity" ||
      angle === "cross_system_integrity") &&
    canonicalEventType !== "action_completed"
  ) {
    return NO_SOURCES_REASON;
  }
  if (angle === "policy_integrity" || angle === "identity_access_integrity") {
    return "INSUFFICIENT_PIPELINE_WIRING_ERROR";
  }
  return "INSUFFICIENT_PIPELINE_WIRING_ERROR";
}

function missingUnitSummary(angle: AngleName, canonicalEventType: string): string {
  const code = missingUnitReasonCode(angle, canonicalEventType);
  if (code === NO_SOURCES_REASON) {
    return `No sources or evidence for ${angle} for canonical event type ${canonicalEventType}.`;
  }
  return `Expected ${angle} proof unit was not produced for this proofable event.`;
}

function isNonApplicableReason(reasonCode: string): boolean {
  return reasonCode === NO_SOURCES_REASON || reasonCode === NOT_APPLICABLE_REASON;
}

function mapRailToSubjectType(rail: RailType): SubjectType {
  switch (rail) {
    case "model":
      return "model";
    case "agent":
      return "agent";
    case "service":
      return "service";
    case "system":
      return "system";
    case "endpoint":
      return "endpoint";
    default:
      throw new Error(`Unsupported subject rail type: ${rail}`);
  }
}

function readPayloadString(payload: unknown, key: string): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v : null;
}

function readPayloadZerionTxHash(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const z = (payload as Record<string, unknown>).zerion;
  if (z === null || typeof z !== "object") return null;
  const th = (z as Record<string, unknown>).tx_hash;
  if (typeof th !== "string") return null;
  const t = th.trim();
  return t.length >= 32 ? t : null;
}

function readPayloadZerionRecipientAddress(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const z = (payload as Record<string, unknown>).zerion;
  if (z === null || typeof z !== "object") return null;
  const recipient = (z as Record<string, unknown>).recipient_address;
  if (typeof recipient !== "string") return null;
  const t = recipient.trim();
  return t.length >= 32 ? t : null;
}

function readPayloadOperationalExecution(payload: unknown): {
  execution_status: string | null;
  runtime_error: string | null;
} {
  if (payload === null || typeof payload !== "object") {
    return { execution_status: null, runtime_error: null };
  }
  const op = (payload as Record<string, unknown>).operational;
  if (op === null || typeof op !== "object") {
    return { execution_status: null, runtime_error: null };
  }
  const o = op as Record<string, unknown>;
  const es = o.execution_status;
  const re = o.runtime_error;
  return {
    execution_status: typeof es === "string" && es.trim() ? es.trim() : null,
    runtime_error:
      re === null || re === undefined
        ? null
        : typeof re === "string"
          ? re.trim() || null
          : null,
  };
}

function applyBaseline(
  angle: ProductAngleResult,
  baseline: ReturnType<typeof deriveAllAngleBaselines>[AngleName],
  persisted?: {
    baseline_snapshot?: Record<string, unknown> | null;
    diff?: {
      delta_detected: boolean;
      delta_type: "none" | "drift" | "violation" | "missing" | "unknown";
      diff_summary: string | null;
      compared_fields?: string[];
      changed_fields?: string[];
    };
  }
): ProductAngleResult {
  const bs =
    persisted?.baseline_snapshot && typeof persisted.baseline_snapshot === "object"
      ? (persisted.baseline_snapshot as unknown as ReturnType<typeof deriveAllAngleBaselines>[AngleName])
      : baseline;
  const diff = persisted?.diff;
  const out: ProductAngleResult = {
    ...angle,
    baseline_present: bs.baseline_present,
    baseline_status: bs.baseline_status,
    baseline_source: bs.baseline_source,
    baseline_version: bs.baseline_version,
    baseline_rule_id: bs.baseline_rule_id,
    baseline_summary: bs.baseline_summary,
    expected_summary: bs.expected_summary,
    actual_summary: bs.actual_summary,
    delta_detected: diff?.delta_detected ?? false,
    delta_type: diff?.delta_type ?? "none",
    diff_summary: diff?.diff_summary ?? null,
    compared_fields: [...(diff?.compared_fields ?? [])].sort(),
    changed_fields: [...(diff?.changed_fields ?? [])].sort(),
    metadata: {
      ...(angle.metadata ?? {}),
      baseline_missing_fields: bs.missing_fields,
      baseline_rule_id: bs.baseline_rule_id,
    },
  };
  if (!bs.baseline_present) {
    const reason =
      bs.missing_fields.length > 0
        ? "SUBJECT_FIELD_MISSING"
        : bs.baseline_status === "unsupported"
          ? "BASELINE_UNSUPPORTED"
          : bs.baseline_source === "none"
            ? "NO_BASELINE_SOURCE"
            : "INSUFFICIENT_CONTEXT";
    const summary = `${bs.baseline_summary ?? "No baseline source"} Missing fields: ${
      bs.missing_fields.join(", ") || "none"
    }.`;
    const shouldForceFallback = out.reason_code === "OK" && out.evidence_refs.length === 0;
    return {
      ...out,
      status: shouldForceFallback ? "insufficient_evidence" : out.status,
      reason_code: shouldForceFallback ? reason : out.reason_code,
      summary: out.summary.trim() ? out.summary : summary,
      evidence_refs: out.evidence_refs.length ? out.evidence_refs : [],
      sources_state: out.sources_state ?? "no sources",
      delta_detected: shouldForceFallback ? true : out.delta_detected,
      delta_type: shouldForceFallback ? "missing" : out.delta_type,
      diff_summary: shouldForceFallback ? (out.diff_summary ?? summary) : out.diff_summary,
    };
  }
  if (out.status === "pass" || out.status === "not_applicable") {
    out.delta_detected = false;
    out.delta_type = "none";
    out.diff_summary = null;
  } else if (out.status === "fail") {
    out.delta_detected = true;
    out.delta_type = out.delta_type === "none" ? "violation" : out.delta_type;
    out.diff_summary = out.diff_summary ?? out.summary;
  } else if (out.status === "insufficient_evidence" || out.status === "warn") {
    out.delta_detected = true;
    out.delta_type = out.delta_type === "none" ? "unknown" : out.delta_type;
    out.diff_summary = out.diff_summary ?? out.summary;
  }
  return out;
}

function policyProofUnit(pipeline: ProcessEventSuccess) {
  return pipeline.proof_units.find((u) => u.angle === "policy_integrity");
}

function deterministicProofUnit(pipeline: ProcessEventSuccess) {
  return pipeline.proof_units.find((u) => u.angle === "deterministic_integrity");
}

function identityAccessProofUnit(pipeline: ProcessEventSuccess) {
  return pipeline.proof_units.find((u) => u.angle === "identity_access_integrity");
}

function operationalProofUnit(pipeline: ProcessEventSuccess) {
  return pipeline.proof_units.find((u) => u.angle === "operational_integrity");
}

function modelIdentityProofUnit(pipeline: ProcessEventSuccess) {
  return pipeline.proof_units.find((u) => u.angle === "model_identity_integrity");
}

function retrievalProofUnit(pipeline: ProcessEventSuccess) {
  return pipeline.proof_units.find((u) => u.angle === "retrieval_integrity");
}

function crossSystemProofUnit(pipeline: ProcessEventSuccess) {
  return pipeline.proof_units.find((u) => u.angle === "cross_system_integrity");
}

function refsFromUnit(unit: ProcessEventSuccess["proof_units"][number]): string[] {
  if (Array.isArray(unit.evidence_refs) && unit.evidence_refs.length > 0) {
    return [...unit.evidence_refs];
  }
  return [unit.proof_id];
}

function passSummaryForAngle(angle: AngleName): string {
  switch (angle) {
    case "policy_integrity":
      return "Policy tags satisfied the active baseline.";
    case "identity_access_integrity":
      return "Identity and access integrity satisfied the active baseline.";
    case "operational_integrity":
      return "Operational integrity satisfied the active baseline.";
    case "model_identity_integrity":
      return "Observed model identity matched the expected model.";
    case "retrieval_integrity":
      return "Retrieval integrity verified.";
    case "deterministic_integrity":
      return "Deterministic digest matched expected value.";
    case "cross_system_integrity":
      return "Cross-system integrity matched expected systems.";
    default:
      return "Angle evaluation passed.";
  }
}

function violatedSummaryForAngle(angle: AngleName): string {
  switch (angle) {
    case "policy_integrity":
      return "Required policy tags were missing or incomplete.";
    case "identity_access_integrity":
      return "Identity and access integrity reported a violation.";
    case "operational_integrity":
      return "Operational integrity reported a violation.";
    case "model_identity_integrity":
      return "Observed model identity did not match the expected model.";
    case "retrieval_integrity":
      return "Retrieval integrity reported a violation.";
    case "deterministic_integrity":
      return "Deterministic integrity reported a violation.";
    case "cross_system_integrity":
      return "Cross-system integrity reported a violation.";
    default:
      return "Integrity angle reported a violation.";
  }
}

function genericIndeterminateSummary(angle: AngleName): string {
  switch (angle) {
    case "policy_integrity":
      return "Policy integrity did not produce a definitive pass/fail.";
    case "identity_access_integrity":
      return "Identity and access integrity did not produce a definitive pass/fail.";
    case "operational_integrity":
      return "Operational integrity did not produce a definitive pass/fail.";
    case "model_identity_integrity":
      return "Model identity integrity did not produce a definitive pass/fail.";
    case "retrieval_integrity":
      return "Retrieval integrity did not produce a definitive pass/fail.";
    case "deterministic_integrity":
      return "Deterministic integrity did not produce a definitive pass/fail.";
    case "cross_system_integrity":
      return "Cross-system integrity did not produce a definitive pass/fail.";
    default:
      return "Angle did not produce a definitive pass/fail.";
  }
}

/**
 * Maps pipeline proof units to product angle outcomes with explicit DB governance semantics.
 */
function mapPipelineUnitToProductAngle(
  angle: AngleName,
  unit: ProcessEventSuccess["proof_units"][number] | undefined,
  canonicalEventType: string,
  baselineControl?: AngleControlState,
): ProductAngleResult {
  if (!unit) {
    if (baselineControl?.enabled === false) {
      return {
        angle,
        applicable: false,
        status: "not_applicable",
        reason_code: REASON_CODE.ANGLE_DISABLED,
        summary: "This angle is disabled in baseline policy and was not evaluated.",
        evidence_refs: [],
        sources_state: "no sources",
      };
    }
    const reasonCode = missingUnitReasonCode(angle, canonicalEventType);
    return {
      angle,
      applicable: !isNonApplicableReason(reasonCode),
      status: "insufficient_evidence",
      reason_code: reasonCode,
      summary: missingUnitSummary(angle, canonicalEventType),
      evidence_refs: [],
      sources_state: "no sources",
    };
  }

  const evidence_refs = refsFromUnit(unit);
  const dc = unit.delta_code ?? "";
  const st = unit.status;

  if (st === "conformant") {
    return {
      angle,
      applicable: true,
      status: "pass",
      reason_code: "OK",
      summary: passSummaryForAngle(angle),
      evidence_refs,
      sources_state: "present",
    };
  }

  if (st === "violated") {
    return {
      angle,
      applicable: true,
      status: "fail",
      reason_code: unit.delta_code || "VIOLATION",
      summary: violatedSummaryForAngle(angle),
      evidence_refs,
      sources_state: "present",
    };
  }

  if (st === "unverifiable") {
    if (dc === REASON_CODE.ANGLE_DISABLED) {
      return {
        angle,
        applicable: false,
        status: "not_applicable",
        reason_code: REASON_CODE.ANGLE_DISABLED,
        summary: "This angle is disabled in baseline policy and was not evaluated.",
        evidence_refs,
        sources_state: evidence_refs.length ? "present" : "no sources",
      };
    }
    if (dc === REASON_CODE.NOT_APPLICABLE) {
      return {
        angle,
        applicable: false,
        status: "not_applicable",
        reason_code: REASON_CODE.NOT_APPLICABLE,
        summary:
          "This angle is not applicable for this canonical event type (evaluator not triggered).",
        evidence_refs,
        sources_state: evidence_refs.length ? "present" : "no sources",
      };
    }
    if (dc === "OPTIONAL_NO_SOURCE" || dc.startsWith("OPTIONAL_")) {
      return {
        angle,
        applicable: true,
        status: "insufficient_evidence",
        reason_code: "OPTIONAL_NO_SOURCE",
        summary: "Optional angle: source data was insufficient for a definitive pass/fail.",
        evidence_refs,
        sources_state: "present",
      };
    }
    if (dc === "REQUIRED_SOURCE_MISSING" || dc === "BASELINE_MISSING" || dc === "NO_BASELINE_SOURCE") {
      return {
        angle,
        applicable: true,
        status: "fail",
        reason_code: dc,
        summary:
          dc === "BASELINE_MISSING"
            ? "Required baseline row was missing for this angle."
            : dc === "NO_BASELINE_SOURCE"
              ? "No baseline source was configured for this angle."
              : "Required source data was missing for this governed angle.",
        evidence_refs,
        sources_state: "present",
      };
    }
    if (baselineControl?.required) {
      return {
        angle,
        applicable: true,
        status: "fail",
        reason_code: dc || "REQUIRED_SOURCE_MISSING",
        summary: "Required angle could not be verified with available evidence.",
        evidence_refs,
        sources_state: "present",
      };
    }
    if (baselineControl?.required === false) {
      return {
        angle,
        applicable: true,
        status: "insufficient_evidence",
        reason_code: "OPTIONAL_NO_SOURCE",
        summary: "Optional angle: source data was insufficient for a definitive pass/fail.",
        evidence_refs,
        sources_state: "present",
      };
    }
    return {
      angle,
      applicable: true,
      status: "insufficient_evidence",
      reason_code: dc || "INSUFFICIENT_EVIDENCE",
      summary: genericIndeterminateSummary(angle),
      evidence_refs,
      sources_state: "present",
    };
  }

  if (st === "flagged") {
    if (dc.startsWith("OPTIONAL_") || dc === "OPTIONAL_NO_SOURCE") {
      return {
        angle,
        applicable: true,
        status: "insufficient_evidence",
        reason_code: "OPTIONAL_NO_SOURCE",
        summary: "Optional angle: source data was insufficient for a definitive pass/fail.",
        evidence_refs,
        sources_state: "present",
      };
    }
    return {
      angle,
      applicable: true,
      status: "insufficient_evidence",
      reason_code: dc || "INSUFFICIENT_EVIDENCE",
      summary: genericIndeterminateSummary(angle),
      evidence_refs,
      sources_state: "present",
    };
  }

  return {
    angle,
    applicable: true,
    status: "insufficient_evidence",
    reason_code: unit.delta_code || "INSUFFICIENT_EVIDENCE",
    summary: genericIndeterminateSummary(angle),
    evidence_refs,
    sources_state: "present",
  };
}

function buildPolicyAngleAndArtifacts(params: {
  unit: ProcessEventSuccess["proof_units"][number] | undefined;
  proofRef: string;
  canonicalEventType: string;
  baselineControl?: AngleControlState;
}): {
  policyAngle: ProductAngleResult;
  flags: ProductFlag[];
} {
  const base = mapPipelineUnitToProductAngle(
    "policy_integrity",
    params.unit,
    params.canonicalEventType,
    params.baselineControl,
  );

  if (!params.unit) {
    if (base.reason_code === REASON_CODE.ANGLE_DISABLED) {
      return { policyAngle: base, flags: [] };
    }
    return {
      policyAngle: base,
      flags: [
        {
          flag_id: deterministicFlagId("policy_integrity", base.reason_code, params.proofRef),
          code: base.reason_code,
          severity: "medium",
          angle: "policy_integrity",
          title: "Policy proof missing",
          message: "Expected a policy_integrity proof unit for this proofable event.",
          evidence_refs: [params.proofRef],
        },
      ],
    };
  }

  if (base.status === "pass" || base.status === "not_applicable") {
    return { policyAngle: base, flags: [] };
  }

  if (base.status === "fail") {
    const code = base.reason_code;
    const flags: ProductFlag[] = [
      {
        flag_id: deterministicFlagId("policy_integrity", code, params.proofRef),
        code,
        severity: "high",
        angle: "policy_integrity",
        title: "Policy integrity violation",
        message: "Observed policy tags did not satisfy the active baseline.",
        evidence_refs: base.evidence_refs,
      },
    ];
    return { policyAngle: base, flags };
  }

  if (base.reason_code === "OPTIONAL_NO_SOURCE") {
    return { policyAngle: base, flags: [] };
  }

  const code = base.reason_code;
  const flags: ProductFlag[] = [
    {
      flag_id: deterministicFlagId("policy_integrity", code, params.proofRef),
      code,
      severity: "medium",
      angle: "policy_integrity",
      title: "Policy integrity could not be verified",
      message: "Policy evaluation did not reach a conformant or violated outcome.",
      evidence_refs: base.evidence_refs,
    },
  ];
  return { policyAngle: base, flags };
}

function buildAngles(
  deterministicAngle: ProductAngleResult,
  policyAngle: ProductAngleResult,
  identityAccessAngle: ProductAngleResult,
  operationalAngle: ProductAngleResult,
  modelIdentityAngle: ProductAngleResult,
  retrievalAngle: ProductAngleResult,
  crossSystemAngle: ProductAngleResult
): ProductAngleResult[] {
  return [
    deterministicAngle,
    policyAngle,
    identityAccessAngle,
    operationalAngle,
    modelIdentityAngle,
    retrievalAngle,
    crossSystemAngle,
  ];
}

function buildProofSummary(proofStatus: ProofStatus): string {
  switch (proofStatus) {
    case "unproofable":
      return "This event could not be turned into a proof (unproofable).";
    case "failed":
      return "Proof failed: at least one integrity angle reported failure.";
    case "flagged":
      return "Proof flagged: review outstanding issues before relying on this event.";
    case "verified":
    default:
      return "Proof verified: no failures or blocking flags on evaluated angles.";
  }
}

/**
 * Builds the billable ProductProof for one successful pipeline run (proofable canonical event).
 */
/**
 * Builds the canonical ProductProof for one successful pipeline run.
 *
 * NOTE: buildProductProof() is the only allowed constructor for production ProductProof objects.
 * It enforces normalized angle order, universal contract validation, and stable failure locator shape.
 *
 * REQUIRES: pipeline.lineage must be complete with all event identity fields.
 * Throws ProductProofInputError if lineage is missing or incomplete.
 */
export function buildProductProof(input: BuildProductProofInput): ProductProof {
  const { body, pipeline, receivedAt, baselineControlByAngle: baselineCtlIn } = input;
  const baselineCtl = baselineCtlIn ?? {};

  if (!pipeline || typeof pipeline !== "object") {
    throw new ProductProofInputError("EVENT_IDENTITY_REQUIRED", "pipeline missing");
  }
  if (pipeline.lineage == null) {
    throw new ProductProofInputError("EVENT_IDENTITY_REQUIRED", "pipeline.lineage");
  }

  // VALIDATE: event identity is complete before any angle or digest work
  const eventIdentity = buildProofEventIdentity(pipeline.lineage);

  const canonicalizationVersion = input.canonicalizationVersion ?? DEFAULT_CANONICALIZATION_VERSION;
  const verifierVersion = input.verifierVersion ?? DEFAULT_VERIFIER_VERSION;

  const deterministicUnit = deterministicProofUnit(pipeline);
  const policyUnit = policyProofUnit(pipeline);
  const identityAccessUnit = identityAccessProofUnit(pipeline);
  const operationalUnit = operationalProofUnit(pipeline);
  const modelIdentityUnit = modelIdentityProofUnit(pipeline);
  const retrievalUnit = retrievalProofUnit(pipeline);
  const crossSystemUnit = crossSystemProofUnit(pipeline);
  const proof_id = policyUnit?.proof_id ?? pipeline.event_id;

  const { policyAngle, flags } = buildPolicyAngleAndArtifacts({
    unit: policyUnit,
    proofRef: proof_id,
    canonicalEventType: pipeline.canonical_event_type,
    baselineControl: baselineCtl["policy_integrity"],
  });

  const deterministicAngle = mapPipelineUnitToProductAngle(
    "deterministic_integrity",
    deterministicUnit,
    pipeline.canonical_event_type,
    baselineCtl["deterministic_integrity"],
  );
  const identityAccessAngle = mapPipelineUnitToProductAngle(
    "identity_access_integrity",
    identityAccessUnit,
    pipeline.canonical_event_type,
    baselineCtl["identity_access_integrity"],
  );
  const operationalAngle = mapPipelineUnitToProductAngle(
    "operational_integrity",
    operationalUnit,
    pipeline.canonical_event_type,
    baselineCtl["operational_integrity"],
  );
  const modelIdentityAngle = mapPipelineUnitToProductAngle(
    "model_identity_integrity",
    modelIdentityUnit,
    pipeline.canonical_event_type,
    baselineCtl["model_identity_integrity"],
  );
  const retrievalAngle = mapPipelineUnitToProductAngle(
    "retrieval_integrity",
    retrievalUnit,
    pipeline.canonical_event_type,
    baselineCtl["retrieval_integrity"],
  );
  const crossSystemAngle = mapPipelineUnitToProductAngle(
    "cross_system_integrity",
    crossSystemUnit,
    pipeline.canonical_event_type,
    baselineCtl["cross_system_integrity"],
  );
  const rawAngles = buildAngles(
    deterministicAngle,
    policyAngle,
    identityAccessAngle,
    operationalAngle,
    modelIdentityAngle,
    retrievalAngle,
    crossSystemAngle
  );
  const baselineMap = deriveAllAngleBaselines({
    subjectType: mapRailToSubjectType(pipeline.subject_rail),
    subjectExternalKey: pipeline.subject_external_key,
    canonicalEvent: {
      payload: (body.payload ?? {}) as Record<string, unknown>,
      trace_id: body.trace_id,
    },
  });
  const unitByAngle = new Map(pipeline.proof_units.map((u) => [u.angle, u]));
  const baselinedAngles = rawAngles.map((a) => {
    const unit = unitByAngle.get(a.angle);
    let out = applyBaseline(a, baselineMap[a.angle], unit);
    const ctrl = baselineCtl[a.angle];
    if (ctrl) {
      out.metadata = {
        ...(out.metadata ?? {}),
        angle_control: {
          enabled: ctrl.enabled,
          required: ctrl.required,
          default_origin: ctrl.default_origin,
        },
      };
    }
    if (ctrl?.enabled === false && out.reason_code !== REASON_CODE.ANGLE_DISABLED) {
      out = {
        ...out,
        applicable: false,
        status: "not_applicable",
        reason_code: REASON_CODE.ANGLE_DISABLED,
        summary: "This angle is disabled in baseline policy and was not evaluated.",
      };
    }
    return out;
  });
  const semanticAngles = baselinedAngles.map(resolveAngleOutcomeSemantics);
  const finalizedAngles = finalizeProofAnglesOrThrow(semanticAngles);
  const proof_status = deriveProofStatus({
    proofability_status: "proofable",
    angles: finalizedAngles,
    flags,
    contract_valid: true,
  });
  const flags_count = deriveFlagsCount(flags);
  const highest_severity = deriveHighestSeverity(flags);
  const proof_summary = buildProofSummary(proof_status);
  const failureLocator = selectFailureLocatorFromProof({
    angles: finalizedAngles,
    proof_status,
    contract_valid: true,
    contract_failure_reason: null,
  });

  const receivedIso = receivedAt.toISOString();
  const subject_type = mapRailToSubjectType(pipeline.subject_rail);
  const opExec = readPayloadOperationalExecution(body.payload);
  const zerionTx = readPayloadZerionTxHash(body.payload);
  const zerionRecipient = readPayloadZerionRecipientAddress(body.payload);

  const draft: ProductProof = {
    proof_id,
    org_id: body.organization_id,
    subject_id: body.subject_id,
    subject_type,
    raw_event_id: pipeline.raw_event_id,
    canonical_event_id: pipeline.event_id,
    event_type: pipeline.canonical_event_type,
    event_timestamp: body.occurred_at.toISOString(),
    received_at: receivedIso,
    source_system: readPayloadString(body.payload, "source_system"),
    source_event_ref: readPayloadString(body.payload, "source_event_ref") ?? body.trace_id,
    proofability_status: "proofable",
    proofability_reason_code: null,
    proofability_summary: null,
    proof_status,
    proof_summary,
    angles: finalizedAngles,
    contract_valid: true,
    contract_failure_reason: null,
    flags,
    flags_count,
    highest_severity,
    failure_locator: failureLocator ?? null,
    canonicalization_version: canonicalizationVersion,
    verifier_version: verifierVersion,
    policy_version: input.policyVersion ?? null,
    baseline_version: input.baselineVersion ?? null,
    proof_digest: "",
    anchor_status: "pending",
    anchor_batch_id: null,
    anchor_chain: SOLANA_SANDBOX_ROUTE,
    anchor_payload: null,
    anchor_tx_hash: null,
    anchor_timestamp: null,
    solana_sandbox: null,
    zerion_tx_hash: zerionTx,
    zerion_recipient_address: zerionRecipient,
    zerion_execution_explorer_url: zerionExecutionExplorerUrlFromTxHash(zerionTx),
    operational_execution_status: opExec.execution_status,
    operational_runtime_error: opExec.runtime_error,
    created_at: receivedIso,
    updated_at: receivedIso,

    // Event identity fields (validated at function entry)
    event_id: eventIdentity.event_id,
    event_lineage_id: eventIdentity.event_lineage_id,
    event_version: eventIdentity.event_version,
    artifact_id: eventIdentity.artifact_id,
    lineage_status: eventIdentity.lineage_status,
    lineage_reason: eventIdentity.lineage_reason,
    matched_prior_event_id: pipeline.lineage.matched_prior_event_id,
    canonical_hash: eventIdentity.canonical_hash,
    artifact_hash: eventIdentity.artifact_hash,
    occurrence_hash: eventIdentity.occurrence_hash,
  };

  const proof_sufficiency = deriveProofSufficiency(draft);
  const draftWithSufficiency = { ...draft, proof_sufficiency };
  const digest = computeProofDigest(toHashableProofPayload(draftWithSufficiency));
  return { ...draftWithSufficiency, proof_digest: digest };
}
