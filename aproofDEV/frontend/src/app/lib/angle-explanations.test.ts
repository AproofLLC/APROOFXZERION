import { describe, expect, it } from "vitest";
import { ANGLE_EXPLANATION_KEYS, ANGLE_EXPLANATIONS, getAngleExplanation } from "./angle-explanations";

describe("angle-explanations (static mappings)", () => {
  it("resolves all seven canonical angles with non-empty fields", () => {
    expect(ANGLE_EXPLANATION_KEYS).toHaveLength(7);
    for (const key of ANGLE_EXPLANATION_KEYS) {
      const ex = ANGLE_EXPLANATIONS[key];
      expect(ex.title.trim().length).toBeGreaterThan(0);
      expect(ex.purpose.trim().length).toBeGreaterThan(0);
      expect(ex.runtimeMeaning.trim().length).toBeGreaterThan(0);
      expect(ex.whyItMatters.trim().length).toBeGreaterThan(0);
      expect(getAngleExplanation(key)).toBe(ex);
    }
  });

  it("returns null for unknown angle keys (safe fallback)", () => {
    expect(getAngleExplanation("not_an_angle")).toBeNull();
    expect(getAngleExplanation("")).toBeNull();
  });
});
