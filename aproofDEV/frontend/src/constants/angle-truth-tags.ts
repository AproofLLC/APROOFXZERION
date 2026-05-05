/**
 * Product truth layer tags for baseline angles (UI). Not stored in DB; reflects governance semantics.
 * Aligns with the baseline defaults mission: Governance / Provenance / Functional.
 */
export type BaselineTruthTag = "Governance" | "Provenance" | "Functional";

export const ANGLE_TRUTH_TAGS: Record<string, readonly BaselineTruthTag[]> = {
  model_identity_integrity: ["Provenance"],
  policy_integrity: ["Governance"],
  operational_integrity: ["Governance"],
  identity_access_integrity: ["Governance", "Provenance"],
  retrieval_integrity: ["Functional", "Provenance"],
  deterministic_integrity: ["Functional"],
  cross_system_integrity: ["Governance", "Functional"],
};

/** Alias for product docs / prompts — same map as `ANGLE_TRUTH_TAGS`. */
export const ANGLE_TAGS = ANGLE_TRUTH_TAGS;

export function truthTagsForAngle(angle: string): BaselineTruthTag[] {
  const t = ANGLE_TRUTH_TAGS[angle];
  return t ? [...t] : ["Governance"];
}
