/// <reference path="../vitest-test-globals.d.ts" />
import { evaluatePolicyIntegrityMvp } from "./policy-evaluator.js";

describe("evaluatePolicyIntegrityMvp", () => {
  const baseline = {
    type: "policy_integrity_v1",
    required_tags: ["allow_read"],
  };

  it("conformant when all required tags present", () => {
    const r = evaluatePolicyIntegrityMvp(baseline, {
      policy: { tags: ["allow_read", "audit"] },
    });
    expect(r.status).toBe("conformant");
    expect(r.deltaCode).toBeNull();
  });

  it("violated when tag missing", () => {
    const r = evaluatePolicyIntegrityMvp(baseline, {
      policy: { tags: ["other"] },
    });
    expect(r.status).toBe("violated");
    expect(r.deltaCode).toBe("POLICY_TAGS_MISSING");
  });

  it("unverifiable when baseline type wrong", () => {
    const r = evaluatePolicyIntegrityMvp({ type: "other" }, { policy: { tags: ["allow_read"] } });
    expect(r.status).toBe("unverifiable");
    expect(r.deltaCode).toBe("POLICY_BASELINE_TYPE");
  });
});
