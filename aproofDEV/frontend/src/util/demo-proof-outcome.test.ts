import { describe, expect, it } from "vitest";
import { getDemoOverviewOutcomeCopy, getOperationalOnlySixOfSevenCopy } from "./demo-proof-outcome";

describe("getDemoOverviewOutcomeCopy", () => {
  it("states when agent rail has no Zerion tx yet", () => {
    const s = getDemoOverviewOutcomeCopy("agent", "conformant", null, null);
    expect(s).toContain("No execution tx yet");
  });

  it("allows conformant agent copy when a tx_hash is present", () => {
    const s = getDemoOverviewOutcomeCopy("agent", "conformant", null, "a".repeat(64));
    expect(s.toLowerCase()).toContain("zerion");
  });

  it("uses integration-not-ready copy for ZERION_INTEGRATION_NOT_READY", () => {
    const s = getDemoOverviewOutcomeCopy("agent", "violated", "ZERION_INTEGRATION_NOT_READY", null);
    expect(s).toContain("Execution layer incomplete");
  });

  it("prefers policy blocked copy over generic no-tx when spend policy fails", () => {
    const s = getDemoOverviewOutcomeCopy("agent", "violated", "POLICY_SPEND_LIMIT_EXCEEDED", null);
    expect(s).toContain("Execution blocked before Zerion CLI invocation");
  });

  it("notes anchored proof without Zerion tx when anchor signature present", () => {
    const s = getDemoOverviewOutcomeCopy("agent", "conformant", null, null, "B".repeat(64));
    expect(s).toContain("AProof proof anchored");
  });
});

describe("getOperationalOnlySixOfSevenCopy", () => {
  it("returns copy only when operational_integrity alone fails among angles", () => {
    const angles = [
      { angle: "policy_integrity", status: "pass", reason_code: "OK" },
      { angle: "identity_access_integrity", status: "pass", reason_code: "OK" },
      { angle: "operational_integrity", status: "fail", reason_code: "X" },
      { angle: "model_identity_integrity", status: "pass", reason_code: "OK" },
      { angle: "retrieval_integrity", status: "pass", reason_code: "OK" },
      { angle: "deterministic_integrity", status: "pass", reason_code: "OK" },
      { angle: "cross_system_integrity", status: "pass", reason_code: "OK" },
    ];
    expect(getOperationalOnlySixOfSevenCopy(angles)).toContain("6/7");
  });

  it("returns null when more than one angle fails", () => {
    const angles = [
      { angle: "policy_integrity", status: "fail", reason_code: "X" },
      { angle: "operational_integrity", status: "fail", reason_code: "Y" },
    ];
    expect(getOperationalOnlySixOfSevenCopy(angles)).toBeNull();
  });
});
