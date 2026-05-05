/** Human-readable labels for the seven universal integrity angles (aligned with backend names). */
export const ANGLE_LABELS: Record<string, { title: string; purpose: string }> = {
  policy_integrity: {
    title: "Policy integrity",
    purpose: "Whether declared policy constraints (tags, rules) are satisfied.",
  },
  identity_access_integrity: {
    title: "Identity & access",
    purpose: "Attribution of actors, scopes, and access decisions.",
  },
  operational_integrity: {
    title: "Operational integrity",
    purpose: "Execution status, latency, and operational bounds.",
  },
  model_identity_integrity: {
    title: "Model identity",
    purpose: "Observed vs expected model identity and versions.",
  },
  retrieval_integrity: {
    title: "Retrieval integrity",
    purpose: "Declared and observed retrieval / sources usage.",
  },
  deterministic_integrity: {
    title: "Deterministic integrity",
    purpose: "Stable digests and comparable behavior under declared config.",
  },
  cross_system_integrity: {
    title: "Cross-system integrity",
    purpose: "References and coherence across external systems.",
  },
};

export function angleNeedsEvidenceWarning(angle: string): boolean {
  return (
    angle === "retrieval_integrity" ||
    angle === "cross_system_integrity" ||
    angle === "identity_access_integrity" ||
    angle === "deterministic_integrity"
  );
}
