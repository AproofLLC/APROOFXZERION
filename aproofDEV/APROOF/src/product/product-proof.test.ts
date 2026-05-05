/// <reference path="../vitest-test-globals.d.ts" />
import {
  EXAMPLE_PRODUCT_PROOF,
  PRODUCT_ANGLE_NAMES,
  deriveFlagsCount,
  deriveHighestSeverity,
  deriveProofStatus,
  validateProductProof,
} from "./product-proof.js";

describe("validateProductProof", () => {
  it("accepts EXAMPLE_PRODUCT_PROOF", () => {
    expect(validateProductProof(EXAMPLE_PRODUCT_PROOF)).toEqual([]);
  });

  it("requires each of the seven product angle names in angles[]", () => {
    const angles = EXAMPLE_PRODUCT_PROOF.angles.map((a) =>
      a.angle === "policy_integrity"
        ? { ...EXAMPLE_PRODUCT_PROOF.angles[0]!, angle: "deterministic_integrity" as const }
        : a
    );
    const bad = { ...EXAMPLE_PRODUCT_PROOF, angles };
    expect(validateProductProof(bad)).toContain('angles must include angle "policy_integrity"');
  });

  it("rejects wrong flags_count", () => {
    const bad = { ...EXAMPLE_PRODUCT_PROOF, flags_count: 99 };
    expect(validateProductProof(bad)).toContain("flags_count must equal flags.length");
  });

  it("rejects inconsistent unproofable", () => {
    const bad: typeof EXAMPLE_PRODUCT_PROOF = {
      ...EXAMPLE_PRODUCT_PROOF,
      proofability_status: "unproofable",
      proof_status: "verified",
    };
    expect(validateProductProof(bad)).toContain(
      "proof_status must be 'unproofable' when proofability_status is 'unproofable'"
    );
  });

  it("rejects non-conformant proof without failure_locator", () => {
    const bad = { ...EXAMPLE_PRODUCT_PROOF, proof_status: "failed" as const, failure_locator: null };
    expect(validateProductProof(bad)).toContain("failure_locator is required when proof_status is non-conformant");
  });

  it("rejects verified proof that still has failure_locator", () => {
    const bad = { ...EXAMPLE_PRODUCT_PROOF, proof_status: "verified" as const };
    expect(validateProductProof(bad)).toContain("failure_locator must be null/omitted when proof_status is 'verified'");
  });
});

describe("PRODUCT_ANGLE_NAMES", () => {
  it("has length 7", () => {
    expect(PRODUCT_ANGLE_NAMES.length).toBe(7);
  });
});

describe("deriveProofStatus", () => {
  it("matches example scenario", () => {
    expect(
      deriveProofStatus({
        proofability_status: EXAMPLE_PRODUCT_PROOF.proofability_status,
        angles: EXAMPLE_PRODUCT_PROOF.angles,
        flags: EXAMPLE_PRODUCT_PROOF.flags,
        contract_valid: true,
      })
    ).toBe("flagged");
  });

  it("failed when any angle fails", () => {
    const angles = EXAMPLE_PRODUCT_PROOF.angles.map((a) =>
      a.angle === "policy_integrity" ? { ...a, status: "fail" as const } : a
    );
    expect(
      deriveProofStatus({
        proofability_status: "proofable",
        angles,
        flags: [],
        contract_valid: true,
      })
    ).toBe("failed");
  });
});

describe("deriveHighestSeverity", () => {
  it("returns medium for example flags", () => {
    expect(deriveHighestSeverity(EXAMPLE_PRODUCT_PROOF.flags)).toBe("medium");
  });
});

describe("deriveFlagsCount", () => {
  it("returns array length", () => {
    expect(deriveFlagsCount(EXAMPLE_PRODUCT_PROOF.flags)).toBe(1);
  });
});
