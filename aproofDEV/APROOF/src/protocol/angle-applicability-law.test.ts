import { describe, it, expect } from "vitest";
import { getApplicableAngles, INTEGRITY_ANGLES } from "./angle-applicability.js";

/**
 * Angle applicability law tests.
 *
 * The universal rule is: all 7 angles are always RETURNED in the proof object.
 * Substantive applicability (whether the angle can produce a definitive pass/fail)
 * is determined by evaluator availability for each canonical event type, not by
 * the applicability map. The applicability map always returns all 7.
 */
describe("angle applicability law", () => {
  const ALL_SEVEN = [...INTEGRITY_ANGLES].sort();

  it("returns exactly 7 angles for policy_checked", () => {
    const result = getApplicableAngles("service", "policy_checked");
    expect(result.map((a) => a.angle).sort()).toEqual(ALL_SEVEN);
    expect(result.every((a) => a.requirement === "REQUIRED")).toBe(true);
  });

  it("returns exactly 7 angles for action_completed", () => {
    const result = getApplicableAngles("system", "action_completed");
    expect(result.map((a) => a.angle).sort()).toEqual(ALL_SEVEN);
  });

  it("returns exactly 7 angles for retrieval_completed", () => {
    const result = getApplicableAngles("agent", "retrieval_completed");
    expect(result.map((a) => a.angle).sort()).toEqual(ALL_SEVEN);
  });

  it("returns exactly 7 angles for model_invoked", () => {
    const result = getApplicableAngles("model", "model_invoked");
    expect(result.map((a) => a.angle).sort()).toEqual(ALL_SEVEN);
  });

  it("returns exactly 7 angles for identity_access_checked", () => {
    const result = getApplicableAngles("endpoint", "identity_access_checked");
    expect(result.map((a) => a.angle).sort()).toEqual(ALL_SEVEN);
  });

  it("returns exactly 7 angles for handoff_completed", () => {
    const result = getApplicableAngles("service", "handoff_completed");
    expect(result.map((a) => a.angle).sort()).toEqual(ALL_SEVEN);
  });

  it("all angles are REQUIRED across all event types", () => {
    const eventTypes = [
      "policy_checked", "action_completed", "retrieval_completed",
      "model_invoked", "identity_access_checked", "handoff_completed",
    ] as const;
    for (const evt of eventTypes) {
      const result = getApplicableAngles("system", evt);
      for (const a of result) {
        expect(a.requirement).toBe("REQUIRED");
      }
    }
  });
});
