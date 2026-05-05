import type { ApplicableAngle, CanonicalEventType, IntegrityAngle, RailType } from "../protocol/angle-applicability.js";
import { getApplicableAngles } from "../protocol/angle-applicability.js";

/**
 * Evaluator trigger set:
 * all seven angles are always part of the product proof surface, while this list controls
 * which evaluators are triggered for a given canonical event and therefore what evidence exists.
 */
const ACTIVE_EVALUATION_ANGLES: ReadonlySet<IntegrityAngle> = new Set([
  "deterministic_integrity",
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "cross_system_integrity",
]);
const ACTIVE_EVALUATION_ORDER: readonly IntegrityAngle[] = [
  "deterministic_integrity",
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "cross_system_integrity",
];

/** Order of `proof_units` appended in `process-event` (failure intelligence sorting). */
export const PIPELINE_PROOF_ANGLE_ORDER: readonly IntegrityAngle[] = ACTIVE_EVALUATION_ORDER;

/**
 * Returns all seven integrity angles for evaluation, sorted by pipeline order.
 */
export function applicableAnglesForEvaluation(
  railType: RailType,
  eventType: CanonicalEventType
): ApplicableAngle[] {
  return getApplicableAngles(railType, eventType)
    .filter((a) => ACTIVE_EVALUATION_ANGLES.has(a.angle))
    .sort(
      (a, b) =>
        ACTIVE_EVALUATION_ORDER.indexOf(a.angle as IntegrityAngle) -
        ACTIVE_EVALUATION_ORDER.indexOf(b.angle as IntegrityAngle)
    );
}
