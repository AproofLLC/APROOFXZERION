import type { ProductAngleResult, ProductFailureLocator, ProofStatus } from "./product-proof.js";

export const FAILURE_LOCATOR_ANGLE_PRIORITY = [
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
] as const;

export type FailureLocatorStep =
  | "baseline_resolution"
  | "baseline_check"
  | "source_validation"
  | "evidence_resolution"
  | "policy_evaluation"
  | "identity_check"
  | "deterministic_check"
  | "cross_system_check"
  | "contract_validation"
  | "proof_build"
  | "lineage_resolution";

const GENERIC_REASON_CODES = new Set([
  "",
  "OK",
  "VIOLATION",
  "INSUFFICIENT_EVIDENCE",
  "POLICY_UNVERIFIABLE",
  "INSUFFICIENT_PIPELINE_WIRING_ERROR",
  "EVALUATOR_PENDING",
]);

const STEP_BY_REASON: Record<string, FailureLocatorStep> = {
  BASELINE_MISSING: "baseline_resolution",
  MISSING_BASELINE: "baseline_resolution",
  POLICY_BASELINE_SHAPE: "baseline_check",
  POLICY_BASELINE_TYPE: "baseline_check",
  NO_SOURCES: "evidence_resolution",
  CROSS_SYSTEM_MISMATCH: "cross_system_check",
  DETERMINISM_DRIFT: "deterministic_check",
  POLICY_VIOLATION: "policy_evaluation",
  IDENTITY_MISMATCH: "identity_check",
  CONTRACT_VIOLATION: "contract_validation",
  UNIVERSAL_ANGLE_CONTRACT_VIOLATION: "contract_validation",
};

export function reasonCodeToFailureStep(reasonCode: string, angle: string): FailureLocatorStep {
  const normalizedReason = reasonCode.trim().toUpperCase();
  const direct = STEP_BY_REASON[normalizedReason];
  if (direct) return direct;
  if (normalizedReason.includes("BASELINE")) return "baseline_resolution";
  if (normalizedReason.includes("NO_SOURCE")) return "evidence_resolution";
  if (normalizedReason.includes("POLICY")) return "policy_evaluation";
  if (normalizedReason.includes("IDENTITY") || normalizedReason.includes("ACCESS")) return "identity_check";
  if (normalizedReason.includes("DETERMIN")) return "deterministic_check";
  if (normalizedReason.includes("CROSS_SYSTEM")) return "cross_system_check";
  if (angle === "retrieval_integrity") return "evidence_resolution";
  return "proof_build";
}

function isFailingStatus(status: ProductAngleResult["status"]): boolean {
  return status === "fail" || status === "insufficient_evidence" || status === "warn";
}

function buildDetail(angle: ProductAngleResult): string {
  const summary = angle.summary?.trim();
  if (summary) return summary;
  return `Integrity check failed at ${angle.angle}.`;
}

export function selectFailureLocatorFromProof(input: {
  angles: ProductAngleResult[];
  proof_status: ProofStatus;
  contract_valid: boolean;
  contract_failure_reason: string | null;
}): ProductFailureLocator | null {
  const { angles, proof_status, contract_valid, contract_failure_reason } = input;
  if (proof_status === "verified") return null;

  if (!contract_valid) {
    return {
      angle: "contract",
      step: "contract_validation",
      reason_code: "UNIVERSAL_ANGLE_CONTRACT_VIOLATION",
      detail: contract_failure_reason?.trim() || "Proof did not satisfy the universal 7-angle contract.",
      failure_type: "diff_violation",
      missing_fields: [],
      baseline_rule_id: null,
    };
  }

  const sorted = [...angles].sort(
    (a, b) => FAILURE_LOCATOR_ANGLE_PRIORITY.indexOf(a.angle) - FAILURE_LOCATOR_ANGLE_PRIORITY.indexOf(b.angle)
  );
  const failing = sorted.filter((a) => isFailingStatus(a.status));
  if (!failing.length) {
    return {
      angle: "contract",
      step: "proof_build",
      reason_code: "NON_CONFORMANT_WITHOUT_ANGLE_FAILURE",
      detail: "Proof status is non-conformant without a specific failing angle.",
      missing_fields: [],
      baseline_rule_id: null,
    };
  }

  const withExplicitReason = failing.find((a) => {
    const reason = (a.reason_code ?? "").trim();
    return reason.length > 0 && !GENERIC_REASON_CODES.has(reason);
  });
  const selected = withExplicitReason ?? failing[0]!;
  const reason = selected.reason_code?.trim() || "ANGLE_FAILURE";
  const missing_fields =
    selected.metadata &&
    typeof selected.metadata === "object" &&
    Array.isArray((selected.metadata as Record<string, unknown>).baseline_missing_fields)
      ? ((selected.metadata as Record<string, unknown>).baseline_missing_fields as string[])
      : undefined;
  const baseline_rule_id =
    selected.metadata &&
    typeof selected.metadata === "object" &&
    typeof (selected.metadata as Record<string, unknown>).baseline_rule_id === "string"
      ? ((selected.metadata as Record<string, unknown>).baseline_rule_id as string)
      : null;
  const failure_type =
    reason === "BASELINE_MISSING"
      ? "baseline_missing"
      : reason === "NO_BASELINE_SOURCE"
        ? "no_source"
        : reason === "SUBJECT_FIELD_MISSING"
          ? "invalid_data"
          : reason === "INSUFFICIENT_CONTEXT"
            ? "insufficient_context"
            : selected.delta_type === "violation"
              ? "diff_violation"
              : selected.delta_type === "drift"
                ? "drift"
                : undefined;

  return {
    angle: selected.angle,
    step: reasonCodeToFailureStep(reason, selected.angle),
    reason_code: reason,
    detail: buildDetail(selected),
    failure_type,
    missing_fields: [...(missing_fields ?? [])].sort(),
    baseline_rule_id: baseline_rule_id ?? null,
  };
}
