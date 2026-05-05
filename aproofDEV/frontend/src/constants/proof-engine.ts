/**
 * Canonical seven-angle order (matches APROOF `PRODUCT_ANGLE_NAMES` / overview builders).
 * UI always renders this many angle rows; merge with API data by `angle` key.
 */
export const CANONICAL_ANGLE_KEYS = [
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
] as const;

export type CanonicalAngleKey = (typeof CANONICAL_ANGLE_KEYS)[number];

/**
 * Proof detail UI order (GET /proofs/:id product_proof.angles). Backend angle id for “model” is
 * `model_identity_integrity`.
 */
export const PROOF_DETAIL_ANGLE_ORDER = [
  "policy_integrity",
  "identity_access_integrity",
  "retrieval_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
] as const;

export type ProofDetailAngleKey = (typeof PROOF_DETAIL_ANGLE_ORDER)[number];

export function formatAngleLabel(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
