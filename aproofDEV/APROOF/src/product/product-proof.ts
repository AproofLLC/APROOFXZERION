/**
 * APROOF product-facing proof object (1 API call = 1 event = 1 ProductProof = 1 billable unit).
 *
 * Mapping notes vs internal protocol / DB:
 * - SubjectType (product) is not identical to `rail_type` in the DB; map at the edge.
 * - Angle names are aligned across product, protocol, and storage enums.
 * - ProofStatus / anchor lifecycle names may differ from `proof_status` / `anchor_state` rows;
 *   translate when persisting or when building this object from storage.
 */

// ============================================================
// CORE ENUMS
// ============================================================

export const SUBJECT_TYPES = [
  "llm",
  "model",
  "agent",
  "service",
  "endpoint",
  "system",
] as const;

export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const UNIVERSAL_ANGLES = [
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
] as const;

export type UniversalAngle = (typeof UNIVERSAL_ANGLES)[number];

export const ANGLE_STATUSES = [
  "pass",
  "fail",
  "warn",
  "not_applicable",
  "insufficient_evidence",
] as const;

export type AngleStatus = (typeof ANGLE_STATUSES)[number];

export type ProofStatus = "verified" | "flagged" | "failed" | "unproofable";

export type ProofabilityStatus = "proofable" | "unproofable";

export type AnchorStatus = "pending" | "batched" | "anchored" | "anchor_failed";

export type Severity = "low" | "medium" | "high" | "critical";

export type AngleName = UniversalAngle;

export type AngleResultStatus = AngleStatus;

export type FailureLayer =
  | "ingestion"
  | "canonicalization"
  | "baseline_resolution"
  | "angle_evaluation"
  | "policy"
  | "cross_system"
  | "anchor_queue"
  | "unknown";

/** Canonical product order for all seven angles (validation + builders). */
export const PRODUCT_ANGLE_NAMES: readonly AngleName[] = [
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
] as const;

// ============================================================
// CHILD OBJECTS
// ============================================================

export interface UniversalAngleResult {
  angle: UniversalAngle;
  applicable: boolean;
  status: AngleStatus;
  reason_code: string;
  summary: string;
  evidence_refs: string[];
  baseline_present?: boolean;
  baseline_status?: "present" | "missing" | "insufficient" | "unsupported";
  baseline_source?: "declared" | "observed" | "policy" | "mixed" | "none";
  baseline_version?: string;
  baseline_rule_id?: string;
  baseline_summary?: string | null;
  expected_summary?: string | null;
  actual_summary?: string | null;
  delta_detected?: boolean;
  delta_type?: "none" | "drift" | "violation" | "missing" | "unknown";
  diff_summary?: string | null;
  compared_fields?: string[];
  changed_fields?: string[];
  sources_state?: "present" | "no sources";
  baseline_ref?: string | null;
  validator_ref?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ProductAngleResult extends UniversalAngleResult {}

export interface ProductFlag {
  flag_id: string;
  code: string;
  severity: Severity;
  angle?: AngleName | null;
  title: string;
  message: string;
  evidence_refs?: string[];
}

export interface FailureLocator {
  angle: UniversalAngle | "contract";
  step: string;
  reason_code: string;
  detail: string;
  failure_type?: "baseline_missing" | "no_source" | "insufficient_context" | "diff_violation" | "drift" | "invalid_data";
  missing_fields?: string[];
  baseline_rule_id?: string | null;
}

export interface ProductFailureLocator extends FailureLocator {}

// ============================================================
// MAIN PRODUCT PROOF OBJECT
// ============================================================

export interface ProductProof {
  proof_id: string;
  org_id: string;
  subject_id: string;
  subject_type: SubjectType;
  raw_event_id: string;
  canonical_event_id: string;
  event_type: string;
  event_timestamp: string;
  received_at: string;
  source_system?: string | null;
  source_event_ref?: string | null;
  proofability_status: ProofabilityStatus;
  proofability_reason_code?: string | null;
  proofability_summary?: string | null;
  proof_status: ProofStatus;
  proof_summary: string;
  angles: ProductAngleResult[];
  contract_valid: boolean;
  contract_failure_reason: string | null;
  flags: ProductFlag[];
  flags_count: number;
  highest_severity?: Severity | null;
  failure_locator?: ProductFailureLocator | null;
  canonicalization_version: string;
  verifier_version: string;
  policy_version?: string | null;
  baseline_version?: string | null;
  proof_digest: string;
  anchor_status: AnchorStatus;
  anchor_batch_id?: string | null;
  anchor_chain?: string | null;
  anchor_mode?: string | null;
  /** Serialized sandbox/local commitment, e.g. aproof:v1:<batch_hash>. */
  anchor_payload?: string | null;
  /** External chain transaction ref — only when a real on-chain writer sets `tx_ref` on a batch. */
  anchor_tx_hash?: string | null;
  anchor_explorer_url?: string | null;
  anchor_wallet_public_key?: string | null;
  anchor_confirmation_status?: string | null;
  anchor_error_message?: string | null;
  anchor_root_hash?: string | null;
  anchor_proof_count?: number | null;
  anchor_proof_ids?: string[] | null;
  anchor_timestamp?: string | null;
  /**
   * Solana-shaped sandbox attestation (simulated, persisted + derivable from `batch_hash`).
   * null before batching/anchor link; not a real devnet attestation.
   */
  solana_sandbox?: {
    route: "solana-sandbox";
    chain_family: "solana";
    cluster: string;
    batch_hash: string;
    anchor_payload: string | null;
    simulated_signature: string;
    simulated_slot: string;
    simulated_commitment: string;
    external_attested: false;
  } | null;
  created_at: string;
  updated_at: string;

  // Event identity fields
  event_id: string;
  event_lineage_id: string;
  event_version: number;
  artifact_id: string;
  lineage_status: "new_lineage" | "existing_lineage_same_state" | "existing_lineage_new_version";
  lineage_reason: string;
  matched_prior_event_id: string | null;
  canonical_hash: string;
  artifact_hash?: string | null;
  occurrence_hash?: string | null;

  /** Optional proof sufficiency tier: "full" | "qualified" | "insufficient". */
  proof_sufficiency?: "full" | "qualified" | "insufficient";
}

export interface UniversalProofContract {
  proof_id: string;
  subject_id: string;
  subject_type: SubjectType;
  angles: UniversalAngleResult[];
  contract_valid: boolean;
  contract_failure_reason: string | null;

  event_id: string;
  event_lineage_id: string;
  event_version: number;
  artifact_id: string;
  lineage_status: "new_lineage" | "existing_lineage_same_state" | "existing_lineage_new_version";
  lineage_reason: string;
  matched_prior_event_id: string | null;

  canonical_hash: string;
  artifact_hash?: string | null;
  occurrence_hash?: string | null;
}

// ============================================================
// PRODUCT RULES
// ============================================================

export const PRODUCT_PROOF_RULES = {
  BILLING_UNIT: "1 API call = 1 event = 1 proof object = 1 billable unit",
  ANGLE_RULE:
    "All 7 angles must be represented. If an angle does not apply, set applicable=false and status='not_applicable'.",
  SUMMARY_RULE: "Every proof must include proof_summary for dashboard/API readability.",
  SIZE_RULE:
    "Do not embed full raw payloads, full canonical payloads, or large evidence blobs inside ProductProof. Store those elsewhere and reference them.",
  DIGEST_RULE:
    "proof_digest must be generated from a stable canonical subset of proof fields only, never from mutable fields like updated_at.",
  ANCHOR_RULE:
    "One proof object does not equal one public-chain transaction. Many proof digests may be included in one anchor batch on the local/sandbox route before external L1 write exists.",
} as const;

export type RequiredMvpProofFields =
  | "proof_id"
  | "org_id"
  | "subject_id"
  | "subject_type"
  | "raw_event_id"
  | "canonical_event_id"
  | "event_type"
  | "event_timestamp"
  | "received_at"
  | "proofability_status"
  | "proof_status"
  | "proof_summary"
  | "angles"
  | "contract_valid"
  | "contract_failure_reason"
  | "flags"
  | "flags_count"
  | "canonicalization_version"
  | "verifier_version"
  | "proof_digest"
  | "anchor_status"
  | "created_at"
  | "updated_at"
  | "lineage_reason";

// ============================================================
// VALIDATION
// ============================================================

export function validateProductProof(proof: ProductProof): string[] {
  const errors: string[] = [];

  if (!proof.proof_id) errors.push("proof_id is required");
  if (!proof.org_id) errors.push("org_id is required");
  if (!proof.subject_id) errors.push("subject_id is required");
  if (!proof.subject_type) errors.push("subject_type is required");
  if (!SUBJECT_TYPES.includes(proof.subject_type)) {
    errors.push("subject_type is unsupported");
  }
  if (!proof.raw_event_id) errors.push("raw_event_id is required");
  if (!proof.canonical_event_id) errors.push("canonical_event_id is required");
  if (!proof.event_type) errors.push("event_type is required");
  if (!proof.event_timestamp) errors.push("event_timestamp is required");
  if (!proof.received_at) errors.push("received_at is required");
  if (!proof.proofability_status) errors.push("proofability_status is required");
  if (!proof.proof_status) errors.push("proof_status is required");
  if (!proof.proof_summary) errors.push("proof_summary is required");
  if (!proof.canonicalization_version) errors.push("canonicalization_version is required");
  if (!proof.verifier_version) errors.push("verifier_version is required");
  if (!proof.proof_digest) errors.push("proof_digest is required");
  if (!proof.anchor_status) errors.push("anchor_status is required");
  if (!proof.created_at) errors.push("created_at is required");
  if (!proof.updated_at) errors.push("updated_at is required");

  if (!Array.isArray(proof.angles)) {
    errors.push("angles must be an array");
  } else if (proof.angles.length !== 7) {
    errors.push("angles must contain exactly 7 entries");
  } else {
    const seen = new Set<AngleName>();
    const actualAngles: AngleName[] = [];
    for (const a of proof.angles) {
      if (typeof a.applicable !== "boolean") {
        errors.push(`angle "${a.angle}" must include boolean applicable`);
      }
      if (!ANGLE_STATUSES.includes(a.status)) {
        errors.push(`angle "${a.angle}" has unsupported status`);
      }
      if (!a.reason_code || !a.reason_code.trim()) {
        errors.push(`angle "${a.angle}" must include reason_code`);
      }
      if (!Array.isArray(a.evidence_refs)) {
        errors.push(`angle "${a.angle}" must include evidence_refs array`);
      }
      seen.add(a.angle);
      actualAngles.push(a.angle);
    }
    for (const name of PRODUCT_ANGLE_NAMES) {
      if (!seen.has(name)) {
        errors.push(`angles must include angle "${name}"`);
      }
    }
    if (!PRODUCT_ANGLE_NAMES.every((name, index) => actualAngles[index] === name)) {
      errors.push("angles must be canonical ordered by PRODUCT_ANGLE_NAMES");
    }
  }

  if (!Array.isArray(proof.flags)) {
    errors.push("flags must be an array");
  }

  if (proof.flags_count !== proof.flags.length) {
    errors.push("flags_count must equal flags.length");
  }

  if (typeof proof.contract_valid !== "boolean") {
    errors.push("contract_valid must be a boolean");
  }

  if (proof.contract_failure_reason === undefined) {
    errors.push("contract_failure_reason is required");
  }

  if (!proof.lineage_reason || typeof proof.lineage_reason !== "string" || proof.lineage_reason.trim() === "") {
    errors.push("lineage_reason is required");
  }

  if (proof.proofability_status === "proofable") {
    if (
      proof.proof_sufficiency === undefined ||
      proof.proof_sufficiency === null ||
      !["full", "qualified", "insufficient"].includes(proof.proof_sufficiency)
    ) {
      errors.push("proof_sufficiency is required for proofable events");
    }
  }

  if (proof.proofability_status === "unproofable" && proof.proof_status !== "unproofable") {
    errors.push("proof_status must be 'unproofable' when proofability_status is 'unproofable'");
  }

  if (proof.proof_status === "verified") {
    if (proof.failure_locator !== null && proof.failure_locator !== undefined) {
      errors.push("failure_locator must be null/omitted when proof_status is 'verified'");
    }
  } else {
    if (!proof.failure_locator) {
      errors.push("failure_locator is required when proof_status is non-conformant");
    } else {
      if (!proof.failure_locator.angle) errors.push("failure_locator.angle is required");
      if (!proof.failure_locator.step || proof.failure_locator.step.trim() === "") {
        errors.push("failure_locator.step is required");
      }
      if (!proof.failure_locator.reason_code || proof.failure_locator.reason_code.trim() === "") {
        errors.push("failure_locator.reason_code is required");
      }
      if (!proof.failure_locator.detail || proof.failure_locator.detail.trim() === "") {
        errors.push("failure_locator.detail is required");
      }
    }
  }

  return errors;
}

// ============================================================
// DERIVATION
// ============================================================

export function deriveHighestSeverity(flags: ProductFlag[]): Severity | null {
  if (!flags.length) return null;

  const rank: Record<Severity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  let highest: Severity = "low";

  for (const flag of flags) {
    if (rank[flag.severity] > rank[highest]) {
      highest = flag.severity;
    }
  }

  return highest;
}

export function deriveProofStatus(params: {
  proofability_status: ProofabilityStatus;
  angles: ProductAngleResult[];
  flags: ProductFlag[];
  contract_valid: boolean;
}): ProofStatus {
  const { proofability_status, angles, flags, contract_valid } = params;

  if (proofability_status === "unproofable") return "unproofable";

  // If contract is invalid, the proof is failed
  if (!contract_valid) return "failed";

  const hasFail = angles.some((a) => a.status === "fail");
  const hasFlag = angles.some((a) => a.status === "warn") || flags.length > 0;

  if (hasFail) return "failed";
  if (hasFlag) return "flagged";
  return "verified";
}

export function deriveFlagsCount(flags: ProductFlag[]): number {
  return flags.length;
}

// ============================================================
// EXAMPLE
// ============================================================

export const EXAMPLE_PRODUCT_PROOF: ProductProof = {
  proof_id: "proof_9f2a1",
  org_id: "org_001",
  subject_id: "subj_llm_prod_01",
  subject_type: "model",
  raw_event_id: "raw_evt_7781",
  canonical_event_id: "canon_evt_7781",
  event_type: "model_response",
  event_timestamp: "2026-04-04T22:14:09Z",
  received_at: "2026-04-04T22:14:10Z",
  source_system: "prod-us-east-1",
  source_event_ref: "req_7781",
  proofability_status: "proofable",
  proofability_reason_code: null,
  proofability_summary: null,
  proof_status: "flagged",
  proof_summary: "Proof flagged due to model identity drift and missing cross-system reference.",
  angles: [
    {
      angle: "policy_integrity",
      applicable: true,
      status: "pass",
      reason_code: "OK",
      summary: "Policy checks passed.",
      evidence_refs: ["ev_1003"],
      sources_state: "present",
    },
    {
      angle: "identity_access_integrity",
      applicable: true,
      status: "pass",
      reason_code: "OK",
      summary: "Access context validated.",
      evidence_refs: ["ev_1005"],
      sources_state: "present",
    },
    {
      angle: "operational_integrity",
      applicable: true,
      status: "pass",
      reason_code: "OK",
      summary: "Operational runtime checks passed.",
      evidence_refs: ["ev_1004"],
      sources_state: "present",
    },
    {
      angle: "model_identity_integrity",
      applicable: true,
      status: "warn",
      reason_code: "MODEL_VERSION_DRIFT",
      summary: "Observed model version differed from active baseline.",
      evidence_refs: ["ev_1002"],
      sources_state: "present",
    },
    {
      angle: "retrieval_integrity",
      applicable: false,
      status: "not_applicable",
      reason_code: "NO_RETRIEVAL_LAYER",
      summary: "No retrieval path present for this event.",
      evidence_refs: [],
      sources_state: "no sources",
    },
    {
      angle: "deterministic_integrity",
      applicable: true,
      status: "pass",
      reason_code: "OK",
      summary: "Deterministic validation passed.",
      evidence_refs: ["ev_1001"],
      sources_state: "present",
    },
    {
      angle: "cross_system_integrity",
      applicable: true,
      status: "insufficient_evidence",
      reason_code: "MISSING_EXTERNAL_REFERENCE",
      summary: "Related upstream reference was not present at evaluation time.",
      evidence_refs: ["ev_1006"],
      sources_state: "present",
    },
  ],
  contract_valid: true,
  contract_failure_reason: null,
  flags: [
    {
      flag_id: "flag_201",
      code: "MODEL_VERSION_DRIFT",
      severity: "medium",
      angle: "model_identity_integrity",
      title: "Model identity drift detected",
      message: "Observed model version differed from expected baseline version.",
      evidence_refs: ["ev_1002"],
    },
  ],
  flags_count: 1,
  highest_severity: "medium",
  failure_locator: {
    angle: "model_identity_integrity",
    step: "angle_evaluation",
    reason_code: "MODEL_VERSION_DRIFT",
    detail: "Primary variance originated in model identity evaluation.",
  },
  canonicalization_version: "1.0.0",
  verifier_version: "1.0.0",
  policy_version: "3.1.0",
  baseline_version: "2.4.0",
  proof_digest: "sha256:8a3f3f45b5c3...",
  anchor_status: "pending",
  anchor_batch_id: null,
  anchor_chain: "solana-sandbox",
  anchor_payload: null,
  anchor_tx_hash: null,
  anchor_timestamp: null,
  solana_sandbox: null,
  created_at: "2026-04-04T22:14:10Z",
  updated_at: "2026-04-04T22:14:10Z",
  event_id: "evt_001",
  event_lineage_id: "lineage_001",
  event_version: 1,
  artifact_id: "artifact_001",
  lineage_status: "new_lineage",
  lineage_reason: "initial proof creation",
  matched_prior_event_id: null,
  canonical_hash: "hash_abc123",
  artifact_hash: null,
  occurrence_hash: null,
  proof_sufficiency: "qualified",
};
