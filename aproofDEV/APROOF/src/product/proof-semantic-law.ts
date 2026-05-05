/**
 * APROOF Proof Semantic Law — centralized semantic interpretation layer.
 *
 * This file is the SINGLE PLACE where proof meaning is determined.
 * All semantic decisions (angle outcome qualification, summary alignment,
 * proof sufficiency rollup) are made here.
 */

import {
  ANGLE_STATUS,
  BASELINE_STATUS,
  PROOFABILITY,
  REASON_CODE,
  PROOF_STATUS,
  PROOF_SUFFICIENCY,
  type ProofSufficiency,
} from "../protocol/proof-vocabulary.js";
import type { ProductAngleResult, ProductProof, AngleStatus } from "./product-proof.js";

/* ------------------------------------------------------------------ */
/* A+C: resolveAngleOutcomeSemantics                                  */
/* ------------------------------------------------------------------ */

/**
 * Central semantic resolution for a single angle result.
 *
 * Enforces the baseline/pass law:
 * - Never allow plain `status === "pass"` with `baseline_status === "missing"`
 *   unless the angle has event-local evidence sufficient for a local pass.
 * - If pass is qualified (evidence exists but baseline is absent), downgrade to
 *   `insufficient_evidence` with reason `PASS_WITHOUT_BASELINE` and metadata note.
 *
 * Also enforces semantic distinction alignment:
 * - NOT_APPLICABLE: `status === not_applicable` with `applicable === false`
 * - NO_SOURCES: `applicable === true`, relevant angle, wrong NA → `insufficient_evidence` + `NO_SOURCES` when reason was NA
 * - INSUFFICIENT_EVIDENCE: some evidence but not enough
 * - BASELINE_MISSING: baseline required but absent
 *
 * Returns the angle unchanged if no semantic contradiction is detected.
 */
export function resolveAngleOutcomeSemantics(angle: ProductAngleResult): ProductAngleResult {
  const baselineMissing =
    angle.baseline_status === BASELINE_STATUS.MISSING ||
    angle.baseline_status === BASELINE_STATUS.INSUFFICIENT ||
    angle.baseline_present === false;

  // Rule 1: pass + baseline missing → qualify or downgrade
  if (angle.status === ANGLE_STATUS.PASS && baselineMissing) {
    const hasLocalEvidence = angle.evidence_refs.length > 0;
    if (hasLocalEvidence) {
      // Evaluator had evidence and passed locally. Preserve pass but add governance note.
      // The evaluator result is trustworthy; baseline incompleteness is a governance limitation.
      return {
        ...angle,
        reason_code: REASON_CODE.PASS_WITHOUT_BASELINE,
        metadata: {
          ...(angle.metadata ?? {}),
          baseline_governance_note:
            "Evaluator produced a local pass result, but synthetic baseline context was absent. " +
            "Governance completeness is limited for full external reliance.",
        },
      };
    }
    // No evidence + no baseline + pass → clearly insufficient
    return {
      ...angle,
      status: ANGLE_STATUS.INSUFFICIENT_EVIDENCE as AngleStatus,
      reason_code: angle.reason_code === REASON_CODE.OK
        ? REASON_CODE.BASELINE_MISSING
        : angle.reason_code,
      summary: buildMissingBaselineSummary(angle),
    };
  }

  // Rule 2: applicable angles must not be marked not_applicable (substantive vs structural).
  // Run BEFORE the structural NA fix so we never "fix" a contradictory NA by only flipping applicable.
  if (
    angle.applicable === true &&
    angle.status === ANGLE_STATUS.NOT_APPLICABLE
  ) {
    return {
      ...angle,
      status: ANGLE_STATUS.INSUFFICIENT_EVIDENCE as AngleStatus,
      reason_code: angle.reason_code === REASON_CODE.NOT_APPLICABLE
        ? REASON_CODE.NO_SOURCES
        : angle.reason_code,
    };
  }

  // Rule 3: not_applicable must have applicable === false (e.g. applicable omitted / unknown)
  if (angle.status === ANGLE_STATUS.NOT_APPLICABLE && angle.applicable !== false) {
    return { ...angle, applicable: false };
  }

  // Rule 4: summary alignment — ensure summary does not contradict status (post-status fixes)
  if (angle.status === ANGLE_STATUS.INSUFFICIENT_EVIDENCE && angle.summary.includes("passed")) {
    return {
      ...angle,
      summary: angle.summary.replace(/passed/gi, "could not be definitively evaluated"),
    };
  }

  return angle;
}

/* ------------------------------------------------------------------ */
/* Summary builders                                                   */
/* ------------------------------------------------------------------ */

function buildMissingBaselineSummary(angle: ProductAngleResult): string {
  return `${angle.angle} could not be definitively evaluated: required baseline is absent.`;
}

/**
 * Build a coherent summary for an angle result.
 * Prefers existing summary if it does not contradict the status.
 */
export function buildAngleSummary(angle: ProductAngleResult): string {
  if (angle.summary && angle.summary.trim()) {
    // Check for narrative contradictions
    if (angle.status === ANGLE_STATUS.FAIL && angle.summary.toLowerCase().includes("passed")) {
      return `${angle.angle} evaluation failed: ${angle.reason_code}.`;
    }
    if (angle.status === ANGLE_STATUS.INSUFFICIENT_EVIDENCE && angle.summary.toLowerCase().includes("passed")) {
      return `${angle.angle} could not be definitively evaluated.`;
    }
    return angle.summary;
  }
  switch (angle.status) {
    case ANGLE_STATUS.PASS:
      return `${angle.angle} evaluation passed.`;
    case ANGLE_STATUS.FAIL:
      return `${angle.angle} evaluation failed: ${angle.reason_code}.`;
    case ANGLE_STATUS.NOT_APPLICABLE:
      return `${angle.angle} is not applicable for this event type.`;
    case ANGLE_STATUS.INSUFFICIENT_EVIDENCE:
      return `${angle.angle} could not be definitively evaluated: insufficient evidence.`;
    default:
      return `${angle.angle} evaluation result: ${angle.status}.`;
  }
}

/* ------------------------------------------------------------------ */
/* E: deriveProofSufficiency                                          */
/* ------------------------------------------------------------------ */

/**
 * Deterministic rollup of proof sufficiency.
 *
 * "full" — all angles definitive (pass/fail/not_applicable), baselines present
 *          where required, contract valid, proofability is proofable.
 * "qualified" — proof exists but has warnings, missing baselines, or
 *               insufficient evidence on some angles.
 * "insufficient" — critical failures, contract invalid, or unproofable.
 */
export function deriveProofSufficiency(proof: ProductProof): ProofSufficiency {
  if (proof.proofability_status === PROOFABILITY.UNPROOFABLE) {
    return PROOF_SUFFICIENCY.INSUFFICIENT;
  }
  if (!proof.contract_valid) {
    return PROOF_SUFFICIENCY.INSUFFICIENT;
  }
  if (proof.proof_status === PROOF_STATUS.FAILED || proof.proof_status === PROOF_STATUS.UNPROOFABLE) {
    return PROOF_SUFFICIENCY.INSUFFICIENT;
  }

  const hasInsufficientEvidence = proof.angles.some(
    (a) => a.status === ANGLE_STATUS.INSUFFICIENT_EVIDENCE,
  );
  const hasMissingBaseline = proof.angles.some(
    (a) => a.applicable !== false && a.baseline_present === false,
  );
  const hasWarnings = proof.angles.some((a) => a.status === ANGLE_STATUS.WARN);
  const hasFlags = proof.flags_count > 0;

  if (hasInsufficientEvidence || hasMissingBaseline || hasWarnings || hasFlags) {
    return PROOF_SUFFICIENCY.QUALIFIED;
  }

  return PROOF_SUFFICIENCY.FULL;
}
