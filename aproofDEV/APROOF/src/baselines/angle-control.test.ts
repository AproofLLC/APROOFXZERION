import { describe, expect, it } from "vitest";
import { isAutoEnabledForRail } from "./angle-control.js";
import { AUTO_ENABLED_ANGLES_BY_RAIL, RAILS_WITH_AUTO_DEFAULTS } from "./auto-enabled-angles-by-rail.js";
import type { RailType } from "../protocol/angle-applicability.js";
import { PRODUCT_ANGLE_NAMES, type AngleName } from "../product/product-proof.js";

describe("angle-control auto-enabled map", () => {
  for (const rail of RAILS_WITH_AUTO_DEFAULTS) {
    it(`isAutoEnabledForRail matches SSOT for ${rail}`, () => {
      const want = new Set(AUTO_ENABLED_ANGLES_BY_RAIL[rail]);
      for (const angle of want) {
        expect(isAutoEnabledForRail(rail, angle as AngleName), `${rail}.${angle}`).toBe(true);
      }
    });
  }

  for (const rail of RAILS_WITH_AUTO_DEFAULTS) {
    it(`${rail} auto-enabled is disjoint from the complement among universal angles`, () => {
      const enabled = new Set(AUTO_ENABLED_ANGLES_BY_RAIL[rail] as readonly string[]);
      for (const angle of PRODUCT_ANGLE_NAMES) {
        const want = enabled.has(angle);
        expect(isAutoEnabledForRail(rail, angle), `${rail}.${angle}`).toBe(want);
      }
    });
  }

  it("all angles are universally enabled for every rail", () => {
    expect(isAutoEnabledForRail("model", "cross_system_integrity")).toBe(true);
    expect(isAutoEnabledForRail("model", "deterministic_integrity")).toBe(true);
    expect(isAutoEnabledForRail("endpoint", "retrieval_integrity")).toBe(true);
    expect(isAutoEnabledForRail("service", "model_identity_integrity")).toBe(true);
  });
});
