export type ModelIdentityBaseline = {
  type: "model_identity_integrity_v1";
  version?: number;
  effective_from?: string;
  expected_model: string;
  require_exact_match: boolean;
};

export type ModelIdentityEvent = {
  observed_model: string | null;
};

export type ModelIdentityEvaluation = {
  angle: "model_identity_integrity";
  applicable: true;
  status: "conformant" | "violated";
  reason_code: string | null;
  summary: string;
  evidence_refs: string[];
};

export function evaluateModelIdentityIntegrity(input: {
  baseline: { type?: unknown; expected_model?: unknown; require_exact_match?: unknown };
  canonicalEvent: ModelIdentityEvent;
}): ModelIdentityEvaluation {
  const { baseline, canonicalEvent } = input;

  if (baseline.type !== "model_identity_integrity_v1") {
    return {
      angle: "model_identity_integrity",
      applicable: true,
      status: "violated",
      reason_code: "MODEL_IDENTITY_BASELINE_INVALID",
      summary: "Model identity baseline was invalid.",
      evidence_refs: [],
    };
  }

  const expectedModel = baseline.expected_model;
  const requireExactMatch = baseline.require_exact_match;
  const observedModel = canonicalEvent.observed_model;

  if (typeof expectedModel !== "string" || !expectedModel.trim() || typeof requireExactMatch !== "boolean") {
    return {
      angle: "model_identity_integrity",
      applicable: true,
      status: "violated",
      reason_code: "MODEL_IDENTITY_BASELINE_INVALID",
      summary: "Model identity baseline was invalid.",
      evidence_refs: [],
    };
  }

  if (typeof observedModel !== "string" || !observedModel.trim()) {
    return {
      angle: "model_identity_integrity",
      applicable: true,
      status: "violated",
      reason_code: "MODEL_IDENTITY_MISSING",
      summary: "Observed model identity was missing.",
      evidence_refs: [],
    };
  }

  if (requireExactMatch && observedModel !== expectedModel) {
    return {
      angle: "model_identity_integrity",
      applicable: true,
      status: "violated",
      reason_code: "MODEL_IDENTITY_MISMATCH",
      summary: "Observed model identity did not match the expected model.",
      evidence_refs: [],
    };
  }

  return {
    angle: "model_identity_integrity",
    applicable: true,
    status: "conformant",
    reason_code: null,
    summary: "Observed model identity matched the expected model.",
    evidence_refs: [],
  };
}
