/**
 * MVP policy_integrity evaluator contract (baseline.definition):
 * { "type": "policy_integrity_v1", "required_tags": string[] }
 * Observed: canonical payload `policy.tags` (string[]).
 */

export type PolicyEvaluationResult =
  | {
      status: "conformant";
      deltaCode: null;
      expectedJson: Record<string, unknown>;
      observedJson: Record<string, unknown>;
      evidenceJson: Record<string, unknown>;
    }
  | {
      status: "violated";
      deltaCode: "POLICY_TAGS_MISSING";
      expectedJson: Record<string, unknown>;
      observedJson: Record<string, unknown>;
      evidenceJson: Record<string, unknown>;
    }
  | {
      status: "unverifiable";
      deltaCode:
        | "POLICY_BASELINE_SHAPE"
        | "POLICY_BASELINE_TYPE"
        | "POLICY_OBSERVED_SHAPE";
      expectedJson: Record<string, unknown> | null;
      observedJson: Record<string, unknown> | null;
      evidenceJson: Record<string, unknown>;
    };

export function evaluatePolicyIntegrityMvp(
  baselineDefinition: unknown,
  canonicalPayload: Record<string, unknown>
): PolicyEvaluationResult {
  if (baselineDefinition === null || typeof baselineDefinition !== "object") {
    return {
      status: "unverifiable",
      deltaCode: "POLICY_BASELINE_SHAPE",
      expectedJson: null,
      observedJson: null,
      evidenceJson: { detail: "baseline.definition_not_object" },
    };
  }
  const def = baselineDefinition as Record<string, unknown>;
  if (def.type !== "policy_integrity_v1") {
    return {
      status: "unverifiable",
      deltaCode: "POLICY_BASELINE_TYPE",
      expectedJson: def as Record<string, unknown>,
      observedJson: null,
      evidenceJson: { detail: "expected_type_policy_integrity_v1" },
    };
  }
  const required = def.required_tags;
  if (!Array.isArray(required) || !required.every((t) => typeof t === "string")) {
    return {
      status: "unverifiable",
      deltaCode: "POLICY_BASELINE_SHAPE",
      expectedJson: def as Record<string, unknown>,
      observedJson: null,
      evidenceJson: { detail: "required_tags_not_string_array" },
    };
  }

  const policy = canonicalPayload.policy;
  if (policy === null || typeof policy !== "object") {
    return {
      status: "unverifiable",
      deltaCode: "POLICY_OBSERVED_SHAPE",
      expectedJson: { required_tags: required },
      observedJson: null,
      evidenceJson: { detail: "payload.policy_missing" },
    };
  }
  const pol = policy as Record<string, unknown>;
  const tags = pol.tags;
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
    return {
      status: "unverifiable",
      deltaCode: "POLICY_OBSERVED_SHAPE",
      expectedJson: { required_tags: required },
      observedJson: policy as Record<string, unknown>,
      evidenceJson: { detail: "payload.policy.tags_not_string_array" },
    };
  }

  const tagSet = new Set(tags as string[]);
  const missing = (required as string[]).filter((t) => !tagSet.has(t));
  const expectedJson = { required_tags: required };
  const observedJson = { tags: tags as string[] };

  if (missing.length > 0) {
    return {
      status: "violated",
      deltaCode: "POLICY_TAGS_MISSING",
      expectedJson,
      observedJson,
      evidenceJson: { missing },
    };
  }

  return {
    status: "conformant",
    deltaCode: null,
    expectedJson,
    observedJson,
    evidenceJson: { matched: true },
  };
}
