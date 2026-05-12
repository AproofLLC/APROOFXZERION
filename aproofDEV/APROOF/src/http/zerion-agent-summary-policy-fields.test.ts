import { describe, expect, it } from "vitest";
import { readPolicyFieldsFromPayload } from "./zerion-agent-summary-service.js";

describe("readPolicyFieldsFromPayload", () => {
  it("returns policy_result and policy_reason_code from canonical payload.policy", () => {
    expect(
      readPolicyFieldsFromPayload({
        policy: { policy_result: "denied", policy_reason_code: "POLICY_SPEND_LIMIT_EXCEEDED" },
      }),
    ).toEqual({
      policy_result: "denied",
      policy_reason_code: "POLICY_SPEND_LIMIT_EXCEEDED",
    });
  });

  it("returns nulls when policy block missing", () => {
    expect(readPolicyFieldsFromPayload({ zerion: {} })).toEqual({
      policy_result: null,
      policy_reason_code: null,
    });
  });
});
