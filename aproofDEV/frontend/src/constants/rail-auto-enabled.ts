/**
 * UI mirror: re-exports the only canonical per-rail auto-enabled list from APROOF.
 * Do not paste angle arrays in this file — they would drift from evaluation defaults and fail integrity.
 *
 * @see APROOF/src/baselines/auto-enabled-angles-by-rail.ts (SSOT, shared with the backend)
 */
import {
  type AutoEnabledAngleRail,
  AUTO_ENABLED_ANGLES_BY_RAIL,
} from "@aproof/baselines/auto-enabled-angles-by-rail";

export { AUTO_ENABLED_ANGLES_BY_RAIL, type AutoEnabledAngleRail };

export function isAngleActiveByDefaultForRail(rail: string, angle: string): boolean {
  if (!(rail in AUTO_ENABLED_ANGLES_BY_RAIL)) return false;
  return (AUTO_ENABLED_ANGLES_BY_RAIL as Record<string, readonly string[]>)[rail]!.includes(angle);
}
