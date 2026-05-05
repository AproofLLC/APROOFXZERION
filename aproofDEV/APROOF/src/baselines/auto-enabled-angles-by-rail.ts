/**
 * Single source of truth: which integrity angles are auto-enabled (default active) for each subject rail.
 * — Runtime: `angle-control.ts` builds `ReadonlySet` for `isAutoEnabledForRail` / `buildInitialBaselineDefinition`.
 * — UI: `frontend/src/constants/rail-auto-enabled.ts` re-exports (must not duplicate the table).
 * — Parity: `scripts/check-repo-integrity.mjs` must not find a divergent hand-maintained copy.
 */
import type { RailType } from "../protocol/angle-applicability.js";
import type { AngleName } from "../product/product-proof.js";

export const RAILS_WITH_AUTO_DEFAULTS: readonly RailType[] = [
  "model",
  "agent",
  "service",
  "endpoint",
  "system",
] as const;

const ALL_ANGLES: readonly AngleName[] = [
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
] as const;

export const AUTO_ENABLED_ANGLES_BY_RAIL = {
  model: ALL_ANGLES,
  agent: ALL_ANGLES,
  service: ALL_ANGLES,
  endpoint: ALL_ANGLES,
  system: ALL_ANGLES,
} as const satisfies Readonly<Record<RailType, readonly AngleName[]>>;

export type AutoEnabledAngleRail = keyof typeof AUTO_ENABLED_ANGLES_BY_RAIL;
