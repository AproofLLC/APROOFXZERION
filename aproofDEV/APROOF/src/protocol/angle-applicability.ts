/**
 * APROOF angle applicability — universal proof surface.
 * All seven integrity angles are part of every proof for every
 * (rail_type × canonical event_type) pair.
 * Event type controls evaluator triggering and evidence sufficiency, not angle omission.
 *
 * Keep `RAIL_TYPES` / `CANONICAL_EVENT_TYPES` / `INTEGRITY_ANGLES` literals aligned with
 * `src/db/schema/index.ts` pgEnum values.
 */

export const RAIL_TYPES = [
  "system",
  "service",
  "agent",
  "model",
  "endpoint",
] as const;

export type RailType = (typeof RAIL_TYPES)[number];

export const CANONICAL_EVENT_TYPES = [
  "request_received",
  "record_accessed",
  "retrieval_completed",
  "model_invoked",
  "policy_checked",
  "identity_access_checked",
  "decision_completed",
  "action_completed",
  "writeback_completed",
  "alert_generated",
  "handoff_completed",
  "access_token_used",
  "config_changed",
  "deployment_changed",
] as const;

export type CanonicalEventType = (typeof CANONICAL_EVENT_TYPES)[number];

export const INTEGRITY_ANGLES = [
  "deterministic_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "policy_integrity",
  "operational_integrity",
  "identity_access_integrity",
  "cross_system_integrity",
] as const;

export type IntegrityAngle = (typeof INTEGRITY_ANGLES)[number];

export type RequirementClass = "REQUIRED" | "CONDITIONAL";

export type ApplicableAngle = Readonly<{
  angle: IntegrityAngle;
  requirement: RequirementClass;
}>;

function sortStable(entries: readonly ApplicableAngle[]): ApplicableAngle[] {
  return [...entries].sort((a, b) => a.angle.localeCompare(b.angle));
}

/**
 * ANGLE APPLICABILITY LAW:
 *
 * All 7 integrity angles are universally RETURNED in every proof object.
 * This maintains the universal 7-angle proof contract.
 *
 * "Applicable" here means "included in the proof shape." It does NOT mean
 * the angle will produce a definitive pass/fail for every event type.
 *
 * Substantive applicability (whether an evaluator can produce a definitive result)
 * is determined by:
 * 1. Whether the canonical event type activates an evaluator for that angle
 * 2. Whether evidence/sources for that angle are present in the payload
 * 3. Whether a baseline exists for that angle/subject
 *
 * When an angle cannot produce a definitive result, it is marked:
 * - `not_applicable` with `applicable: false` if genuinely irrelevant
 * - `insufficient_evidence` with reason `NO_SOURCES` if relevant but lacking evidence
 * - `insufficient_evidence` with reason `BASELINE_MISSING` if lacking baseline
 *
 * This separation keeps the proof shape universal while allowing semantic precision.
 */
const UNIVERSAL_APPLICABLE: ApplicableAngle[] = sortStable(
  INTEGRITY_ANGLES.map((angle) => ({ angle, requirement: "REQUIRED" as const }))
);

/**
 * Returns the full angle set for (rail_type, event_type). Same seven angles for every pair.
 * Result order is stable (sorted by angle name).
 *
 * Parameters are accepted for future extensibility but currently unused —
 * all 7 angles are universally required.
 */
export function getApplicableAngles(
  _railType: RailType,
  _eventType: CanonicalEventType
): ApplicableAngle[] {
  return [...UNIVERSAL_APPLICABLE];
}
