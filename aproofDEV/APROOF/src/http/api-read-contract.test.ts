import { describe, expect, it } from "vitest";
import { ProductProofSchema, ProofListResponseSchema } from "./api-schema.js";
import { apiErrorEnvelope, notProofableApiError } from "./api-error-envelope.js";
import { PRODUCT_ANGLE_NAMES, type AngleName } from "../product/product-proof.js";

function makeAngle(angle: AngleName) {
  return {
    angle,
    applicable: true,
    status: "pass" as const,
    reason_code: "OK",
    summary: "ok",
    evidence_refs: ["e1"],
    baseline_present: true,
    baseline_status: "present" as const,
    baseline_source: "policy" as const,
    baseline_version: "v1",
    baseline_rule_id: "r1",
    baseline_summary: null,
    expected_summary: null,
    actual_summary: null,
    delta_detected: false,
    delta_type: "none" as const,
    diff_summary: null,
    sources_state: "present" as const,
  };
}

describe("API read contract (schemas + error envelope)", () => {
  it("error envelope matches stable contract", () => {
    const e = apiErrorEnvelope("TEST_CODE", "Human message", { field: "x" });
    expect(e).toEqual({
      ok: false,
      error: { code: "TEST_CODE", message: "Human message", details: { field: "x" } },
    });
    const np = notProofableApiError({
      reason: "mapping_missing",
      raw_event_id: "raw-1",
      pipeline_code: "NOT_PROOFABLE",
    });
    expect(np.ok).toBe(false);
    expect(np.error.code).toBe("NOT_PROOFABLE");
    expect(np.error.details?.reason).toBe("mapping_missing");
    expect(np.error.details?.raw_event_id).toBe("raw-1");
  });

  it("ProductProofSchema rejects non-canonical angle order", () => {
    const angles = PRODUCT_ANGLE_NAMES.map(makeAngle);
    const reversed = [...angles].reverse();
    const base = {
      proof_id: "p1",
      org_id: "o1",
      subject_id: "s1",
      subject_type: "service" as const,
      raw_event_id: "r1",
      canonical_event_id: "c1",
      event_type: "action_completed",
      event_timestamp: "2026-01-01T00:00:00.000Z",
      received_at: "2026-01-01T00:00:00.000Z",
      proofability_status: "proofable" as const,
      proof_status: "verified" as const,
      proof_summary: "ok",
      contract_valid: true,
      contract_failure_reason: null,
      flags: [],
      flags_count: 0,
      highest_severity: null,
      failure_locator: null,
      canonicalization_version: "0.1.0",
      verifier_version: "0.1.0",
      proof_digest: "sha256:abc",
      anchor_status: "pending" as const,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      event_id: "e1",
      event_lineage_id: "l1",
      event_version: 1,
      artifact_id: "a1",
      lineage_status: "new_lineage" as const,
      lineage_reason: "x",
      matched_prior_event_id: null,
      canonical_hash: "h",
      artifact_hash: null,
      occurrence_hash: null,
      proof_sufficiency: "full" as const,
    };
    expect(ProductProofSchema.safeParse({ ...base, angles: reversed }).success).toBe(false);
    expect(ProductProofSchema.safeParse({ ...base, angles }).success).toBe(true);
  });

  it("ProofListResponseSchema accepts empty list", () => {
    expect(
      ProofListResponseSchema.safeParse({
        items: [],
        page: { limit: 10, offset: 0, total: 0 },
      }).success
    ).toBe(true);
  });
});
