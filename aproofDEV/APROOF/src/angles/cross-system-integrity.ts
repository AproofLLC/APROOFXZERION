export type CrossSystemIntegrityBaseline = {
  type: "cross_system_integrity_v1";
  expected_systems: string[];
  require_all_systems: boolean;
};

export type CrossSystemIntegrityEvent = {
  observed_systems: string[];
};

export type CrossSystemIntegrityEvaluation = {
  angle: "cross_system_integrity";
  applicable: true;
  status: "conformant" | "violated";
  reason_code: string | null;
  summary: string | null;
  evidence_refs: string[];
};

export function evaluateCrossSystemIntegrity(input: {
  baseline: {
    type?: unknown;
    expected_systems?: unknown;
    require_all_systems?: unknown;
  };
  canonicalEvent: {
    observed_systems?: unknown;
  };
}): CrossSystemIntegrityEvaluation {
  const { baseline, canonicalEvent } = input;

  if (
    baseline.type !== "cross_system_integrity_v1" ||
    !Array.isArray(baseline.expected_systems) ||
    !baseline.expected_systems.every((s) => typeof s === "string") ||
    typeof baseline.require_all_systems !== "boolean"
  ) {
    return {
      angle: "cross_system_integrity",
      applicable: true,
      status: "violated",
      reason_code: "CROSS_SYSTEM_BASELINE_INVALID",
      summary: "Cross-system baseline was invalid.",
      evidence_refs: [],
    };
  }

  const observed = canonicalEvent.observed_systems;
  if (!Array.isArray(observed) || !observed.every((s) => typeof s === "string") || observed.length === 0) {
    return {
      angle: "cross_system_integrity",
      applicable: true,
      status: "violated",
      reason_code: "CROSS_SYSTEM_SYSTEMS_MISSING",
      summary: "Observed cross-system linkage was missing.",
      evidence_refs: [],
    };
  }

  if (baseline.require_all_systems) {
    const observedSet = new Set(observed);
    const missingAny = baseline.expected_systems.some((system) => !observedSet.has(system));
    if (missingAny) {
      return {
        angle: "cross_system_integrity",
        applicable: true,
        status: "violated",
        reason_code: "CROSS_SYSTEM_EXPECTED_SYSTEM_MISSING",
        summary: "Observed cross-system linkage did not include all expected systems.",
        evidence_refs: [],
      };
    }
  }

  return {
    angle: "cross_system_integrity",
    applicable: true,
    status: "conformant",
    reason_code: null,
    summary: "Cross-system integrity matched expected systems.",
    evidence_refs: [],
  };
}
