import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTO_ENABLED_ANGLES_BY_RAIL, isAngleActiveByDefaultForRail } from "./rail-auto-enabled";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("rail-auto-enabled re-export (SSOT)", () => {
  it("re-exports with all 7 angles for each rail, matching SSOT module", () => {
    const ssotPath = path.resolve(__dirname, "../../../APROOF/src/baselines/auto-enabled-angles-by-rail.ts");
    const s = readFileSync(ssotPath, "utf8");
    expect(s).toContain("AUTO_ENABLED_ANGLES_BY_RAIL");
    for (const key of Object.keys(AUTO_ENABLED_ANGLES_BY_RAIL) as (keyof typeof AUTO_ENABLED_ANGLES_BY_RAIL)[]) {
      expect(AUTO_ENABLED_ANGLES_BY_RAIL[key]).toHaveLength(7);
      expect(s).toContain(`${key}:`);
    }
  });

  it("all angles are universally enabled for every rail", () => {
    expect(isAngleActiveByDefaultForRail("model", "retrieval_integrity")).toBe(true);
    expect(isAngleActiveByDefaultForRail("model", "deterministic_integrity")).toBe(true);
    expect(isAngleActiveByDefaultForRail("model", "cross_system_integrity")).toBe(true);
    expect(isAngleActiveByDefaultForRail("endpoint", "model_identity_integrity")).toBe(true);
    expect(isAngleActiveByDefaultForRail("service", "cross_system_integrity")).toBe(true);
  });
});
