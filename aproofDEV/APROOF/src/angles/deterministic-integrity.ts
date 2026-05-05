export type DeterministicIntegrityBaseline = {
  type: "deterministic_integrity_v1";
  expected_digest: string;
  algorithm: "sha256";
  require_exact_match: boolean;
};

export type DeterministicIntegrityEvent = {
  observed_digest: string | null;
};

export type DeterministicIntegrityEvaluation = {
  angle: "deterministic_integrity";
  applicable: true;
  status: "conformant" | "violated";
  reason_code: string | null;
  summary: string | null;
  evidence_refs: string[];
};

export function evaluateDeterministicIntegrity(input: {
  baseline: {
    type?: unknown;
    expected_digest?: unknown;
    algorithm?: unknown;
    require_exact_match?: unknown;
  };
  canonicalEvent: DeterministicIntegrityEvent;
}): DeterministicIntegrityEvaluation {
  const { baseline, canonicalEvent } = input;

  if (
    baseline.type !== "deterministic_integrity_v1" ||
    baseline.algorithm !== "sha256" ||
    typeof baseline.expected_digest !== "string" ||
    !baseline.expected_digest.trim() ||
    typeof baseline.require_exact_match !== "boolean"
  ) {
    return {
      angle: "deterministic_integrity",
      applicable: true,
      status: "violated",
      reason_code: "DETERMINISTIC_BASELINE_INVALID",
      summary: "Deterministic baseline was invalid.",
      evidence_refs: [],
    };
  }

  const observedDigest = canonicalEvent.observed_digest;
  if (typeof observedDigest !== "string" || !observedDigest.trim()) {
    return {
      angle: "deterministic_integrity",
      applicable: true,
      status: "violated",
      reason_code: "DETERMINISTIC_DIGEST_MISSING",
      summary: "Observed deterministic digest was missing.",
      evidence_refs: [],
    };
  }

  if (baseline.require_exact_match && observedDigest !== baseline.expected_digest) {
    return {
      angle: "deterministic_integrity",
      applicable: true,
      status: "violated",
      reason_code: "DETERMINISTIC_DIGEST_MISMATCH",
      summary: "Observed deterministic digest did not match expected value.",
      evidence_refs: [],
    };
  }

  return {
    angle: "deterministic_integrity",
    applicable: true,
    status: "conformant",
    reason_code: null,
    summary: "Deterministic digest matched expected value.",
    evidence_refs: [],
  };
}
