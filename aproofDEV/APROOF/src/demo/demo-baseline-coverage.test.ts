import { describe, expect, it } from "vitest";
import { deriveAllAngleBaselines, BASELINE_ANGLES } from "../baselines/baseline-registry.js";
import {
  cleanSystemControlPayload,
  cleanServicePolicyCheckedPayload,
  cleanModelPolicyCheckedPayload,
  cleanAgentPolicyCheckedPayload,
  cleanEndpointPolicyCheckedPayload,
} from "./demo-clean-payloads.js";

function expectNoMissingBaseline(
  subjectType: string,
  payload: Record<string, unknown>,
  traceId = "trace-baseline-test"
): void {
  const map = deriveAllAngleBaselines({
    subjectType,
    canonicalEvent: { payload, trace_id: traceId },
  });
  for (const angle of BASELINE_ANGLES) {
    const row = map[angle];
    expect(row.missing_fields, `${subjectType}/${angle}`).toEqual([]);
    expect(row.baseline_present, `${subjectType}/${angle}`).toBe(true);
    expect(row.baseline_status, `${subjectType}/${angle}`).toBe("present");
  }
}

describe("demo baseline coverage (registry-required fields)", () => {
  it("system control payload satisfies all angle baselines", () => {
    expectNoMissingBaseline("system", cleanSystemControlPayload() as Record<string, unknown>);
  });

  it("service policy_checked payload satisfies all angle baselines", () => {
    expectNoMissingBaseline("service", cleanServicePolicyCheckedPayload() as Record<string, unknown>);
  });

  it("model policy_checked payload satisfies all angle baselines", () => {
    expectNoMissingBaseline("model", cleanModelPolicyCheckedPayload() as Record<string, unknown>);
  });

  it("agent policy_checked payload satisfies all angle baselines", () => {
    expectNoMissingBaseline("agent", cleanAgentPolicyCheckedPayload() as Record<string, unknown>);
  });

  it("endpoint policy_checked payload satisfies all angle baselines", () => {
    expectNoMissingBaseline("endpoint", cleanEndpointPolicyCheckedPayload() as Record<string, unknown>);
  });

  it("thin endpoint payload still exposes real baseline gaps (negative control)", () => {
    const thin = { route: "/v1/chat", policy: { tags: ["allow_read"] } };
    const map = deriveAllAngleBaselines({
      subjectType: "endpoint",
      canonicalEvent: { payload: thin, trace_id: "t" },
    });
    const missingSomewhere = BASELINE_ANGLES.some((a) => map[a].missing_fields.length > 0);
    expect(missingSomewhere).toBe(true);
  });
});
