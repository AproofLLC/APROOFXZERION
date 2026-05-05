/// <reference path="../vitest-test-globals.d.ts" />
import { describe, expect, it } from "vitest";
import { selectFailureLocatorFromProof } from "./failure-locator.js";
import type { ProductAngleResult } from "./product-proof.js";
import { PRODUCT_ANGLE_NAMES } from "./product-proof.js";

function baseAngles(): ProductAngleResult[] {
  return PRODUCT_ANGLE_NAMES.map((angle) => ({
    angle,
    status: "pass",
    reason_code: "OK",
    summary: "ok",
    evidence_refs: ["proof-1"],
    applicable: true,
    sources_state: "present",
  }));
}

describe("selectFailureLocatorFromProof", () => {
  it("maps BASELINE_MISSING on policy_integrity to baseline_resolution", () => {
    const angles = baseAngles();
    angles[0] = {
      ...angles[0],
      status: "insufficient_evidence",
      reason_code: "BASELINE_MISSING",
      summary: "Required policy_integrity baseline was not found for this subject at event time.",
    };
    const locator = selectFailureLocatorFromProof({
      angles,
      proof_status: "flagged",
      contract_valid: true,
      contract_failure_reason: null,
    });
    expect(locator).toMatchObject({
      angle: "policy_integrity",
      step: "baseline_resolution",
      reason_code: "BASELINE_MISSING",
      detail: "Required policy_integrity baseline was not found for this subject at event time.",
      baseline_rule_id: null,
      failure_type: "baseline_missing",
    });
    expect(locator?.missing_fields).toEqual([]);
  });

  it("maps NO_SOURCES on retrieval_integrity to evidence_resolution", () => {
    const angles = baseAngles();
    angles[4] = {
      ...angles[4],
      status: "insufficient_evidence",
      reason_code: "NO_SOURCES",
      summary: "No sources or evidence for retrieval_integrity for canonical event type policy_checked.",
      evidence_refs: [],
      sources_state: "no sources",
    };
    const locator = selectFailureLocatorFromProof({
      angles,
      proof_status: "flagged",
      contract_valid: true,
      contract_failure_reason: null,
    });
    expect(locator?.angle).toBe("retrieval_integrity");
    expect(locator?.step).toBe("evidence_resolution");
    expect(locator?.reason_code).toBe("NO_SOURCES");
  });

  it("selects primary locator by canonical angle priority across multiple failures", () => {
    const angles = baseAngles();
    angles[5] = {
      ...angles[5],
      status: "fail",
      reason_code: "DETERMINISM_DRIFT",
      summary: "Determinism drift observed.",
    };
    angles[0] = {
      ...angles[0],
      status: "insufficient_evidence",
      reason_code: "BASELINE_MISSING",
      summary: "Required policy_integrity baseline was not found for this subject at event time.",
    };
    const locator = selectFailureLocatorFromProof({
      angles,
      proof_status: "failed",
      contract_valid: true,
      contract_failure_reason: null,
    });
    expect(locator?.angle).toBe("policy_integrity");
    expect(locator?.reason_code).toBe("BASELINE_MISSING");
  });

  it("returns null for clean conformant proof", () => {
    const locator = selectFailureLocatorFromProof({
      angles: baseAngles(),
      proof_status: "verified",
      contract_valid: true,
      contract_failure_reason: null,
    });
    expect(locator).toBeNull();
  });

  it("returns contract_validation locator for invalid contract", () => {
    const locator = selectFailureLocatorFromProof({
      angles: baseAngles(),
      proof_status: "failed",
      contract_valid: false,
      contract_failure_reason: "Proof did not satisfy the universal 7-angle contract.",
    });
    expect(locator).toMatchObject({
      angle: "contract",
      step: "contract_validation",
      reason_code: "UNIVERSAL_ANGLE_CONTRACT_VIOLATION",
      detail: "Proof did not satisfy the universal 7-angle contract.",
      failure_type: "diff_violation",
    });
  });
});
