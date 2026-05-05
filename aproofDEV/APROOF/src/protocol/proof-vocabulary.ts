/**
 * APROOF Proof Vocabulary — single semantic source of truth.
 *
 * This file centralizes all contract-critical constants and their intended meanings.
 * Import from here instead of using string literals for protocol-critical values.
 *
 * Rules:
 * - Every value here is part of the proof contract.
 * - Changes to these values are protocol-visible and must be versioned.
 * - Comments describe the exact intended meaning for governance, audit, and provenance consumers.
 */

/* ------------------------------------------------------------------ */
/* Proofability                                                       */
/* ------------------------------------------------------------------ */

/** Whether an event can produce a proof at all. */
export const PROOFABILITY = {
  /** Event met all preconditions and a proof was generated. */
  PROOFABLE: "proofable",
  /** Event did not meet preconditions (missing mapping, subject, identity conflict, etc.). */
  UNPROOFABLE: "unproofable",
} as const;

/* ------------------------------------------------------------------ */
/* Proof Status                                                       */
/* ------------------------------------------------------------------ */

/** Top-level proof outcome. Derived from angle results + contract validity. */
export const PROOF_STATUS = {
  /** All angles passed or are not applicable; contract valid; no flags. */
  VERIFIED: "verified",
  /** No angle failed, but warnings or flags are present. */
  FLAGGED: "flagged",
  /** At least one angle failed or the contract is invalid. */
  FAILED: "failed",
  /** Event was not proofable; proof object exists only as a rejection record. */
  UNPROOFABLE: "unproofable",
} as const;

/* ------------------------------------------------------------------ */
/* Angle Status                                                       */
/* ------------------------------------------------------------------ */

/** Outcome of a single integrity angle evaluation. */
export const ANGLE_STATUS = {
  /** Angle evaluated successfully; evidence confirms conformance with baseline/expectation. */
  PASS: "pass",
  /** Angle evaluated; evidence confirms a violation or deviation from baseline/expectation. */
  FAIL: "fail",
  /** Angle evaluated; result is ambiguous or minor deviation detected. Requires human review. */
  WARN: "warn",
  /** Angle does not substantively apply to this event type/subject, but is included for universal contract completeness. */
  NOT_APPLICABLE: "not_applicable",
  /** Angle is relevant, but available evidence is insufficient to produce a definitive pass or fail. */
  INSUFFICIENT_EVIDENCE: "insufficient_evidence",
} as const;

/* ------------------------------------------------------------------ */
/* Baseline Status                                                    */
/* ------------------------------------------------------------------ */

/** State of baseline availability for an angle. */
export const BASELINE_STATUS = {
  /** A valid, active baseline exists for this angle at event time. */
  PRESENT: "present",
  /** No baseline row found for this angle/subject. */
  MISSING: "missing",
  /** Baseline exists but required fields are incomplete or unusable. */
  INSUFFICIENT: "insufficient",
  /** Baseline configuration is not supported for this angle/subject type combination. */
  UNSUPPORTED: "unsupported",
} as const;

/* ------------------------------------------------------------------ */
/* Sources State                                                      */
/* ------------------------------------------------------------------ */

/**
 * Describes evidence/source availability for an angle.
 * This is independent of angle applicability — an applicable angle may have no sources.
 */
export const SOURCES_STATE = {
  /** Evidence or source data for this angle was present in the event payload. */
  PRESENT: "present",
  /** No evidence or source data for this angle was found in the event payload. */
  NO_SOURCES: "no sources",
} as const;

/* ------------------------------------------------------------------ */
/* Reason Codes                                                       */
/* ------------------------------------------------------------------ */

/** Reason codes used across angle results, failure locators, and proof metadata. */
export const REASON_CODE = {
  /** Evaluation succeeded with no issues. */
  OK: "OK",

  /** Angle does not substantively apply to this event type. */
  NOT_APPLICABLE: "NOT_APPLICABLE",

  /** Angle is relevant but no source data or evidence was available. */
  NO_SOURCES: "NO_SOURCES",

  /** Required baseline is absent for this angle/subject. */
  BASELINE_MISSING: "BASELINE_MISSING",

  /** No baseline source configured for this angle/subject type. */
  NO_BASELINE_SOURCE: "NO_BASELINE_SOURCE",

  /** Baseline exists but subject-specific fields are missing. */
  SUBJECT_FIELD_MISSING: "SUBJECT_FIELD_MISSING",

  /** Baseline type is not supported for this angle/subject type. */
  BASELINE_UNSUPPORTED: "BASELINE_UNSUPPORTED",

  /** Baseline or context is present but insufficient for evaluation. */
  INSUFFICIENT_CONTEXT: "INSUFFICIENT_CONTEXT",

  /** Evaluator for this angle was expected but did not produce a proof unit (pipeline wiring issue). */
  INSUFFICIENT_PIPELINE_WIRING_ERROR: "INSUFFICIENT_PIPELINE_WIRING_ERROR",

  /**
   * Angle pass is qualified: evaluator produced a local pass result,
   * but baseline was missing, so governance completeness is limited.
   */
  PASS_WITHOUT_BASELINE: "PASS_WITHOUT_BASELINE",

  /** DB baseline policy has this angle disabled — intentionally not evaluated. */
  ANGLE_DISABLED: "ANGLE_DISABLED",

  /** Enabled as optional; insufficient source data for a definitive pass/fail. */
  OPTIONAL_NO_SOURCE: "OPTIONAL_NO_SOURCE",

  /** Enabled as required; source data missing for evaluation. */
  REQUIRED_SOURCE_MISSING: "REQUIRED_SOURCE_MISSING",

  /** Angle is valid but not applicable for this subject type — treated as conformant pass. */
  NOT_APPLICABLE_VALID: "NOT_APPLICABLE_VALID",

  /** Subject has no retrieval requirement — valid non-applicable pass. */
  NO_RETRIEVAL_EXPECTED: "NO_RETRIEVAL_EXPECTED",

  /** Subject has no model dependency — valid non-applicable pass. */
  NO_MODEL_EXPECTED: "NO_MODEL_EXPECTED",

  /** Subject has no cross-system dependencies — valid non-applicable pass. */
  NO_CROSS_SYSTEM_DEPENDENCIES: "NO_CROSS_SYSTEM_DEPENDENCIES",
} as const;

/* ------------------------------------------------------------------ */
/* Delta Types                                                        */
/* ------------------------------------------------------------------ */

/** Type of deviation detected between baseline expectation and observed state. */
export const DELTA_TYPE = {
  /** No deviation detected. */
  NONE: "none",
  /** Minor or gradual deviation (not a hard violation). */
  DRIFT: "drift",
  /** Hard violation of baseline expectation. */
  VIOLATION: "violation",
  /** Expected data or baseline is missing entirely. */
  MISSING: "missing",
  /** Deviation type could not be determined. */
  UNKNOWN: "unknown",
} as const;

/* ------------------------------------------------------------------ */
/* Failure Types (failure locator)                                    */
/* ------------------------------------------------------------------ */

/** Classification of a failure for the failure locator. */
export const FAILURE_TYPE = {
  BASELINE_MISSING: "baseline_missing",
  NO_SOURCE: "no_source",
  INSUFFICIENT_CONTEXT: "insufficient_context",
  DIFF_VIOLATION: "diff_violation",
  DRIFT: "drift",
  INVALID_DATA: "invalid_data",
} as const;

/* ------------------------------------------------------------------ */
/* Proof Sufficiency                                                  */
/* ------------------------------------------------------------------ */

/**
 * Proof sufficiency indicates the reliance level that consumers can place on this proof.
 * Separates "proof exists" from "proof is sufficient for a given governance level."
 */
export const PROOF_SUFFICIENCY = {
  /** All angles definitive (pass/fail/not_applicable), baselines present where required, contract valid. */
  FULL: "full",
  /** Proof exists but has qualified results: warnings, missing baselines on non-critical angles, or insufficient evidence. */
  QUALIFIED: "qualified",
  /** Critical failures, missing baselines on required angles, contract invalid, or unproofable. */
  INSUFFICIENT: "insufficient",
} as const;

export type ProofSufficiency = (typeof PROOF_SUFFICIENCY)[keyof typeof PROOF_SUFFICIENCY];
