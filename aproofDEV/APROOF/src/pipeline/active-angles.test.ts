/// <reference path="../vitest-test-globals.d.ts" />
import { getApplicableAngles } from "../protocol/angle-applicability.js";
import { applicableAnglesForEvaluation } from "./active-angles.js";

const ALL_SEVEN_SORTED = [
  "deterministic_integrity",
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "cross_system_integrity",
];

describe("applicableAnglesForEvaluation", () => {
  it("returns all 7 angles for request_received", () => {
    const active = applicableAnglesForEvaluation("service", "request_received").map((a) => a.angle);
    expect(active).toEqual(ALL_SEVEN_SORTED);
  });

  it("returns all 7 angles for record_accessed", () => {
    const active = applicableAnglesForEvaluation("service", "record_accessed");
    expect(active.map((a) => a.angle)).toEqual(ALL_SEVEN_SORTED);
    expect(active[0]?.requirement).toBe("REQUIRED");
  });

  it("returns all 7 angles for retrieval_completed", () => {
    const active = applicableAnglesForEvaluation("service", "retrieval_completed").map((a) => a.angle);
    expect(active).toEqual(ALL_SEVEN_SORTED);
  });

  it("returns all 7 angles for action_completed", () => {
    const active = applicableAnglesForEvaluation("service", "action_completed").map((a) => a.angle);
    expect(active).toEqual(ALL_SEVEN_SORTED);
  });

  it("full protocol applicability matches active evaluation count", () => {
    const full = getApplicableAngles("service", "request_received").map((a) => a.angle);
    const active = applicableAnglesForEvaluation("service", "request_received").map((a) => a.angle);
    expect(full.length).toBe(7);
    expect(active.length).toBe(7);
  });
});
