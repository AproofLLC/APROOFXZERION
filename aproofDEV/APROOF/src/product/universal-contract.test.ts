import { describe, expect, it } from "vitest";
import {
  assertUniversalAngleContract,
  buildNoSourcesAngleResult,
  buildNotApplicableAngleResult,
  buildMissingBaselineAngleResult,
  buildInsufficientEvidenceAngleResult,
} from "./universal-contract";
import { UNIVERSAL_ANGLES } from "./product-proof";

describe("Universal Angle Contract Validator", () => {
  it("accepts valid 7-angle result set", () => {
    const results = UNIVERSAL_ANGLES.map(angle => ({
      angle,
      applicable: true,
      status: "pass" as const,
      reason_code: "OK",
      summary: `Test summary for ${angle}`,
      evidence_refs: ["test_ref"],
      sources_state: "present" as const,
    }));

    const result = assertUniversalAngleContract(results);
    expect(result.ok).toBe(true);
    expect(result.normalized).toHaveLength(7);
    expect(result.failureReason).toBe(null);
  });

  it("rejects incomplete angle set (missing angle)", () => {
    const results = UNIVERSAL_ANGLES.slice(0, 6).map(angle => ({
      angle,
      applicable: true,
      status: "pass" as const,
      reason_code: "OK",
      summary: `Test summary for ${angle}`,
      evidence_refs: ["test_ref"],
      sources_state: "present" as const,
    }));

    const result = assertUniversalAngleContract(results);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toContain("INCOMPLETE_ANGLE_SET");
    expect(result.normalized).toEqual([]);
  });

  it("rejects duplicate angles", () => {
    const results = [
      ...UNIVERSAL_ANGLES.slice(0, 6).map(angle => ({
        angle,
        applicable: true,
        status: "pass" as const,
        reason_code: "OK",
        summary: `Test summary for ${angle}`,
        evidence_refs: ["test_ref"],
        sources_state: "present" as const,
      })),
      {
        angle: "policy_integrity" as const,
        applicable: true,
        status: "pass" as const,
        reason_code: "OK",
        summary: "Duplicate angle",
        evidence_refs: ["test_ref"],
        sources_state: "present" as const,
      },
    ];

    const result = assertUniversalAngleContract(results);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toContain("ANGLE_CONTRACT_VIOLATION");
    expect(result.failureReason).toContain("Duplicate angle");
  });

  it("rejects unknown angles", () => {
    const results = UNIVERSAL_ANGLES.map(angle => {
      if (angle === "deterministic_integrity") {
        return {
          angle: "unknown_angle" as any,
          applicable: true,
          status: "pass" as const,
          reason_code: "OK",
          summary: "Unknown angle",
          evidence_refs: ["test_ref"],
          sources_state: "present" as const,
        };
      }
      return {
        angle,
        applicable: true,
        status: "pass" as const,
        reason_code: "OK",
        summary: `Test summary for ${angle}`,
        evidence_refs: ["test_ref"],
        sources_state: "present" as const,
      };
    });

    const result = assertUniversalAngleContract(results);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toContain("ANGLE_CONTRACT_VIOLATION");
    expect(result.failureReason).toContain("Unknown angle");
  });

  it("rejects missing required fields", () => {
    const results = UNIVERSAL_ANGLES.map(angle => ({
      angle,
      applicable: true,
      status: "pass" as const,
      reason_code: "", // Empty string should fail
      summary: `Test summary for ${angle}`,
      evidence_refs: ["test_ref"],
      sources_state: "present" as const,
    }));

    const result = assertUniversalAngleContract(results);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toContain("ANGLE_CONTRACT_VIOLATION");
  });

  it("normalizes sources_state correctly", () => {
    const results = UNIVERSAL_ANGLES.map(angle => ({
      angle,
      applicable: false,
      status: "insufficient_evidence" as const,
      reason_code: "NO_SOURCES",
      summary: `Test summary for ${angle}`,
      evidence_refs: [], // Empty evidence
    }));

    const result = assertUniversalAngleContract(results);
    expect(result.ok).toBe(true);
    result.normalized.forEach(angle => {
      expect(angle.sources_state).toBe("no sources");
    });
  });

  it("sorts angles into canonical order", () => {
    // Provide angles in wrong order
    const results = [...UNIVERSAL_ANGLES].reverse().map(angle => ({
      angle,
      applicable: true,
      status: "pass" as const,
      reason_code: "OK",
      summary: `Test summary for ${angle}`,
      evidence_refs: ["test_ref"],
      sources_state: "present" as const,
    }));

    const result = assertUniversalAngleContract(results);
    expect(result.ok).toBe(true);
    expect(result.normalized.map(a => a.angle)).toEqual(UNIVERSAL_ANGLES);
  });

  it("all normalized angles emit a universal canonical field set", () => {
    const results = UNIVERSAL_ANGLES.map((angle) => ({
      angle,
      status: "not_applicable" as const,
      reason_code: "NO_SOURCES",
      summary: `summary for ${angle}`,
      evidence_refs: [],
      applicable: false,
    }));
    const normalized = assertUniversalAngleContract(results);
    expect(normalized.ok).toBe(true);
    const expectedKeys = [
      "actual_summary",
      "angle",
      "applicable",
      "baseline_present",
      "baseline_rule_id",
      "baseline_source",
      "baseline_status",
      "baseline_summary",
      "baseline_version",
      "changed_fields",
      "compared_fields",
      "evidence_refs",
      "expected_summary",
      "reason_code",
      "sources_state",
      "status",
      "summary",
    ];
    for (const angle of normalized.normalized) {
      expect(Object.keys(angle).sort()).toEqual(expectedKeys);
    }
  });

  it("eliminates undefined/null drift for normalized optional fields", () => {
    const result = assertUniversalAngleContract(
      UNIVERSAL_ANGLES.map((angle) => ({
        angle,
        status: "insufficient_evidence" as const,
        reason_code: "NO_SOURCES",
        summary: "s",
        evidence_refs: [],
      }))
    );
    expect(result.ok).toBe(true);
    for (const angle of result.normalized) {
      expect(angle.evidence_refs).toEqual([]);
      expect(angle.compared_fields).toEqual([]);
      expect(angle.changed_fields).toEqual([]);
      expect(angle.expected_summary).toBeNull();
      expect(angle.actual_summary).toBeNull();
    }
  });
});

describe("Safe Default Builders", () => {
  it("buildNoSourcesAngleResult creates valid result", () => {
    const result = buildNoSourcesAngleResult("retrieval_integrity", "NO_SOURCES", "No retrieval data");
    expect(result.angle).toBe("retrieval_integrity");
    expect(result.status).toBe("insufficient_evidence");
    expect(result.reason_code).toBe("NO_SOURCES");
    expect(result.summary).toBe("No retrieval data");
    expect(result.evidence_refs).toEqual([]);
    expect(result.sources_state).toBe("no sources");
  });

  it("buildNotApplicableAngleResult creates valid result", () => {
    const result = buildNotApplicableAngleResult("retrieval_integrity", "NO_RETRIEVAL_LAYER", "Not applicable");
    expect(result.angle).toBe("retrieval_integrity");
    expect(result.status).toBe("not_applicable");
    expect(result.reason_code).toBe("NO_RETRIEVAL_LAYER");
    expect(result.summary).toBe("Not applicable");
    expect(result.evidence_refs).toEqual([]);
    expect(result.sources_state).toBe("no sources");
    expect(result.applicable).toBe(false);
  });

  it("buildMissingBaselineAngleResult creates valid result", () => {
    const result = buildMissingBaselineAngleResult("policy_integrity", "Missing baseline");
    expect(result.angle).toBe("policy_integrity");
    expect(result.applicable).toBe(false);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.reason_code).toBe("BASELINE_MISSING");
    expect(result.summary).toBe("Missing baseline");
    expect(result.evidence_refs).toEqual([]);
    expect(result.sources_state).toBe("no sources");
  });

  it("buildInsufficientEvidenceAngleResult creates valid result", () => {
    const result = buildInsufficientEvidenceAngleResult("operational_integrity", "INSUFFICIENT_DATA", "Not enough data");
    expect(result.angle).toBe("operational_integrity");
    expect(result.status).toBe("insufficient_evidence");
    expect(result.reason_code).toBe("INSUFFICIENT_DATA");
    expect(result.summary).toBe("Not enough data");
    expect(result.evidence_refs).toEqual([]);
    expect(result.sources_state).toBe("no sources");
  });

  it("rejects evaluated angle without evidence refs", () => {
    const results = UNIVERSAL_ANGLES.map((angle) => ({
      angle,
      applicable: true,
      status: "pass" as const,
      reason_code: "OK",
      summary: `summary for ${angle}`,
      evidence_refs: [],
    }));
    const result = assertUniversalAngleContract(results);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toContain("evidence_refs cannot be empty");
  });
});