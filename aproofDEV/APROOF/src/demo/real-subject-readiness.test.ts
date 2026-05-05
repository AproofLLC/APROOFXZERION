/// <reference path="../vitest-test-globals.d.ts" />
import { describe, expect, it } from "vitest";
import {
  REAL_SUBJECT_BASELINE_CONTRACT,
  REAL_SUBJECT_EVALUATION_MATRIX,
  assertBaselineContractCompleteness,
} from "./real-subject-readiness.js";

describe("real subject baseline contract", () => {
  it("is complete for all seven angles for system subject", () => {
    expect(() =>
      assertBaselineContractCompleteness(REAL_SUBJECT_BASELINE_CONTRACT, "system")
    ).not.toThrow();
  });

  it("provides machine-readable evaluation matrix coverage", () => {
    expect(REAL_SUBJECT_EVALUATION_MATRIX.subject_type).toBe("system");
    expect(Object.keys(REAL_SUBJECT_EVALUATION_MATRIX.angle_inputs)).toHaveLength(7);
    expect(Object.keys(REAL_SUBJECT_EVALUATION_MATRIX.event_expectations).length).toBeGreaterThanOrEqual(5);
  });
});
