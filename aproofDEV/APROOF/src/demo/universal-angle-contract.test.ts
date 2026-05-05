import { describe, expect, it } from "vitest";
import { UNIVERSAL_ANGLES, PRODUCT_ANGLE_NAMES } from "../product/product-proof.js";
import { AUTO_ENABLED_ANGLES_BY_RAIL, RAILS_WITH_AUTO_DEFAULTS } from "../baselines/auto-enabled-angles-by-rail.js";
import { isAutoEnabledForRail, buildInitialBaselineDefinition, parseAngleControl } from "../baselines/angle-control.js";
import { SANDBOX_RAIL_BASELINE_SHAPES } from "./sandbox-rail-baseline-shapes.js";
import { REASON_CODE } from "../protocol/proof-vocabulary.js";
import type { RailType } from "../protocol/angle-applicability.js";
import type { AngleName } from "../product/product-proof.js";

describe("Universal 7-Angle Contract", () => {
  it("UNIVERSAL_ANGLES contains exactly 7 angles", () => {
    expect(UNIVERSAL_ANGLES).toHaveLength(7);
  });

  it("every rail has all 7 angles auto-enabled", () => {
    for (const rail of RAILS_WITH_AUTO_DEFAULTS) {
      const angles = AUTO_ENABLED_ANGLES_BY_RAIL[rail];
      expect(angles, `${rail} should have 7 angles`).toHaveLength(7);
      for (const angle of UNIVERSAL_ANGLES) {
        expect(
          (angles as readonly string[]).includes(angle),
          `${rail} missing ${angle}`,
        ).toBe(true);
      }
    }
  });

  it("isAutoEnabledForRail returns true for all angles on all rails", () => {
    for (const rail of RAILS_WITH_AUTO_DEFAULTS) {
      for (const angle of PRODUCT_ANGLE_NAMES) {
        expect(
          isAutoEnabledForRail(rail, angle),
          `${rail}.${angle} should be auto-enabled`,
        ).toBe(true);
      }
    }
  });

  it("buildInitialBaselineDefinition sets enabled=true for all angles on all rails", () => {
    for (const rail of RAILS_WITH_AUTO_DEFAULTS) {
      for (const angle of PRODUCT_ANGLE_NAMES) {
        const def = buildInitialBaselineDefinition(rail, angle);
        const ac = parseAngleControl(def, rail, angle);
        expect(ac.enabled, `${rail}.${angle} should be enabled`).toBe(true);
      }
    }
  });

  it("sandbox baseline shapes define all 7 angles for every rail", () => {
    for (const rail of RAILS_WITH_AUTO_DEFAULTS) {
      const shape = SANDBOX_RAIL_BASELINE_SHAPES[rail];
      for (const angle of UNIVERSAL_ANGLES) {
        expect(
          shape[angle as keyof typeof shape],
          `${rail} sandbox shape missing ${angle}`,
        ).toBeDefined();
      }
    }
  });

  it("non-applicable valid reason codes exist in vocabulary", () => {
    expect(REASON_CODE.NOT_APPLICABLE_VALID).toBe("NOT_APPLICABLE_VALID");
    expect(REASON_CODE.NO_RETRIEVAL_EXPECTED).toBe("NO_RETRIEVAL_EXPECTED");
    expect(REASON_CODE.NO_MODEL_EXPECTED).toBe("NO_MODEL_EXPECTED");
    expect(REASON_CODE.NO_CROSS_SYSTEM_DEPENDENCIES).toBe("NO_CROSS_SYSTEM_DEPENDENCIES");
  });

  it("system rail includes retrieval_integrity baseline", () => {
    const shape = SANDBOX_RAIL_BASELINE_SHAPES.system;
    expect(shape.retrieval_integrity).toBeDefined();
    expect(shape.retrieval_integrity.type).toBe("retrieval_integrity_v1");
  });
});
