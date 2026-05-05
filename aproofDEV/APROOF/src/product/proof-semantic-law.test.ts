import { describe, it, expect } from "vitest";
import { resolveAngleOutcomeSemantics, deriveProofSufficiency, buildAngleSummary } from "./proof-semantic-law.js";
import type { ProductAngleResult, ProductProof } from "./product-proof.js";

function baseAngle(overrides: Partial<ProductAngleResult> = {}): ProductAngleResult {
  return {
    angle: "policy_integrity",
    applicable: true,
    status: "pass",
    reason_code: "OK",
    summary: "Policy integrity passed.",
    evidence_refs: ["ev1"],
    sources_state: "present",
    baseline_present: true,
    baseline_status: "present",
    baseline_source: "policy",
    baseline_version: "v1",
    baseline_rule_id: "policy.v1",
    baseline_summary: "Baseline present.",
    expected_summary: null,
    actual_summary: null,
    delta_detected: false,
    delta_type: "none",
    diff_summary: null,
    ...overrides,
  };
}

describe("resolveAngleOutcomeSemantics", () => {
  it("preserves pass when baseline is present", () => {
    const result = resolveAngleOutcomeSemantics(baseAngle());
    expect(result.status).toBe("pass");
    expect(result.reason_code).toBe("OK");
  });

  it("qualifies pass with governance note when baseline missing but evidence exists", () => {
    const result = resolveAngleOutcomeSemantics(baseAngle({
      baseline_present: false,
      baseline_status: "missing",
    }));
    expect(result.status).toBe("pass");
    expect(result.reason_code).toBe("PASS_WITHOUT_BASELINE");
    expect((result.metadata as Record<string, string>)?.baseline_governance_note).toBeTruthy();
  });

  it("downgrades to insufficient_evidence when baseline missing and no evidence", () => {
    const result = resolveAngleOutcomeSemantics(baseAngle({
      baseline_present: false,
      baseline_status: "missing",
      evidence_refs: [],
    }));
    expect(result.status).toBe("insufficient_evidence");
    expect(result.reason_code).toBe("BASELINE_MISSING");
  });

  it("downgrades applicable+not_applicable to insufficient_evidence (substantive contradiction)", () => {
    const result = resolveAngleOutcomeSemantics(baseAngle({
      status: "not_applicable",
      applicable: true,
    }));
    expect(result.status).toBe("insufficient_evidence");
    expect(result.applicable).toBe(true);
    expect(result.reason_code).toBe("OK");
  });

  it("maps NOT_APPLICABLE reason to NO_SOURCES when angle was wrongly marked not_applicable but applicable", () => {
    const result = resolveAngleOutcomeSemantics(baseAngle({
      status: "not_applicable",
      applicable: true,
      reason_code: "NOT_APPLICABLE",
    }));
    expect(result.status).toBe("insufficient_evidence");
    expect(result.reason_code).toBe("NO_SOURCES");
    expect(result.applicable).toBe(true);
  });

  it("sets applicable false when not_applicable and applicable was omitted (structural NA)", () => {
    const result = resolveAngleOutcomeSemantics(
      baseAngle({
        status: "not_applicable",
        applicable: undefined as unknown as boolean,
        reason_code: "NOT_APPLICABLE",
      })
    );
    expect(result.status).toBe("not_applicable");
    expect(result.applicable).toBe(false);
  });

  it("does not modify fail status", () => {
    const result = resolveAngleOutcomeSemantics(baseAngle({
      status: "fail",
      reason_code: "VIOLATION",
    }));
    expect(result.status).toBe("fail");
  });

  it("does not modify insufficient_evidence status", () => {
    const result = resolveAngleOutcomeSemantics(baseAngle({
      status: "insufficient_evidence",
      reason_code: "NO_SOURCES",
      evidence_refs: [],
    }));
    expect(result.status).toBe("insufficient_evidence");
  });
});

describe("buildAngleSummary", () => {
  it("returns existing summary when no contradiction", () => {
    const result = buildAngleSummary(baseAngle());
    expect(result).toBe("Policy integrity passed.");
  });

  it("corrects contradictory summary for fail status", () => {
    const result = buildAngleSummary(baseAngle({
      status: "fail",
      reason_code: "VIOLATION",
      summary: "Policy passed successfully.",
    }));
    expect(result).not.toContain("passed");
  });

  it("generates summary when empty", () => {
    const result = buildAngleSummary(baseAngle({ summary: "" }));
    expect(result).toContain("passed");
  });
});

describe("deriveProofSufficiency", () => {
  function baseProof(overrides: Partial<ProductProof> = {}): ProductProof {
    return {
      proof_id: "test",
      org_id: "test",
      subject_id: "test",
      subject_type: "system",
      raw_event_id: "test",
      canonical_event_id: "test",
      event_type: "test",
      event_timestamp: "2026-01-01T00:00:00Z",
      received_at: "2026-01-01T00:00:00Z",
      proofability_status: "proofable",
      proof_status: "verified",
      proof_summary: "test",
      angles: [baseAngle()],
      contract_valid: true,
      contract_failure_reason: null,
      flags: [],
      flags_count: 0,
      canonicalization_version: "0.1.0",
      verifier_version: "0.1.0",
      proof_digest: "test",
      anchor_status: "pending",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      event_id: "test",
      event_lineage_id: "test",
      event_version: 1,
      lineage_status: "new_lineage",
      lineage_reason: "test",
      matched_prior_event_id: null,
      canonical_hash: "test",
      ...overrides,
    };
  }

  it("returns full when all angles pass with baselines", () => {
    expect(deriveProofSufficiency(baseProof())).toBe("full");
  });

  it("returns insufficient when proof_status is failed", () => {
    expect(deriveProofSufficiency(baseProof({ proof_status: "failed" }))).toBe("insufficient");
  });

  it("returns insufficient when contract invalid", () => {
    expect(deriveProofSufficiency(baseProof({ contract_valid: false }))).toBe("insufficient");
  });

  it("returns qualified when baseline missing on applicable angle", () => {
    expect(deriveProofSufficiency(baseProof({
      angles: [baseAngle({ baseline_present: false })],
    }))).toBe("qualified");
  });

  it("returns qualified when flags present", () => {
    expect(deriveProofSufficiency(baseProof({
      flags_count: 1,
      flags: [{ flag_id: "f1", code: "TEST", severity: "low", title: "t", message: "m" }],
    }))).toBe("qualified");
  });

  it("returns insufficient when unproofable", () => {
    expect(deriveProofSufficiency(baseProof({ proofability_status: "unproofable" }))).toBe("insufficient");
  });
});
