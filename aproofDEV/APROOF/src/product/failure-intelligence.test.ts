import { describe, expect, it } from "vitest";
import type { ProcessEventSuccess } from "../pipeline/process-event.js";
import type { ProductProof } from "./product-proof.js";
import {
  buildFailureClusterKey,
  buildFailureRollup,
  mapDeltaCodeToFailureCategory,
} from "./failure-intelligence.js";

function minimalProof(angles: ProductProof["angles"]): ProductProof {
  return {
    proof_id: "p1",
    org_id: "o1",
    subject_id: "s1",
    subject_type: "service",
    raw_event_id: "r1",
    canonical_event_id: "c1",
    event_type: "action_completed",
    event_timestamp: "2026-01-01T00:00:00.000Z",
    received_at: "2026-01-01T00:00:00.000Z",
    proofability_status: "proofable",
    proof_status: "failed",
    proof_summary: "failed",
    proof_sufficiency: "insufficient",
    angles,
    flags: [],
    flags_count: 0,
    contract_valid: true,
    contract_failure_reason: null,
    failure_locator: {
      angle: "policy_integrity",
      step: "angle_evaluation",
      reason_code: "X",
      detail: "test",
    },
    canonicalization_version: "0.1.0",
    verifier_version: "0.1.0",
    proof_digest: "d",
    anchor_status: "pending",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    event_id: "e",
    event_lineage_id: "l1",
    event_version: 1,
    lineage_status: "new_lineage",
    lineage_reason: "test",
    matched_prior_event_id: null,
    canonical_hash: "h",
  };
}

describe("failure intelligence", () => {
  it("maps baseline missing to CONFIG_MISSING", () => {
    expect(mapDeltaCodeToFailureCategory("BASELINE_MISSING")).toBe("CONFIG_MISSING");
  });

  it("maps mismatch to MISMATCH", () => {
    expect(mapDeltaCodeToFailureCategory("DETERMINISTIC_DIGEST_MISMATCH")).toBe("MISMATCH");
    expect(mapDeltaCodeToFailureCategory("MODEL_IDENTITY_MISMATCH")).toBe("MISMATCH");
  });

  it("maps latency exceeded to THRESHOLD_EXCEEDED", () => {
    expect(mapDeltaCodeToFailureCategory("OPERATIONAL_LATENCY_EXCEEDED")).toBe("THRESHOLD_EXCEEDED");
  });

  it("maps retrieval expected source missing to EXPECTED_SOURCE_MISSING", () => {
    expect(mapDeltaCodeToFailureCategory("RETRIEVAL_EXPECTED_SOURCE_MISSING")).toBe(
      "EXPECTED_SOURCE_MISSING"
    );
    expect(mapDeltaCodeToFailureCategory("CROSS_SYSTEM_EXPECTED_SYSTEM_MISSING")).toBe(
      "EXPECTED_SOURCE_MISSING"
    );
  });

  it("builds stable cluster keys", () => {
    expect(buildFailureClusterKey("deterministic_integrity", "MISMATCH", "DETERMINISTIC_DIGEST_MISMATCH")).toBe(
      "deterministic_integrity:MISMATCH:DETERMINISTIC_DIGEST_MISMATCH"
    );
    expect(buildFailureClusterKey("policy_integrity", "CONFIG_MISSING", null)).toBe(
      "policy_integrity:CONFIG_MISSING:none"
    );
  });

  it("builds a primary failure rollup from proof units sorted in product angle order", () => {
    const pipeline: ProcessEventSuccess = {
      ok: true,
      source_type_key: "t",
      raw_event_id: "r",
      event_id: "e",
      canonical_event_type: "action_completed",
      subject_rail: "service",
      proof_units: [
        {
          proof_id: "p-pol",
          status: "violated",
          angle: "policy_integrity",
          delta_code: "POLICY_TAGS_MISSING",
        },
        {
          proof_id: "p-det",
          status: "violated",
          angle: "deterministic_integrity",
          delta_code: "DETERMINISTIC_DIGEST_MISMATCH",
        },
      ],
      failure_locators_created: 0,
      lineage_anomaly: null,
      lineage: {
        event_id: "e",
        event_lineage_id: "l1",
        event_version: 1,
        lineage_status: "new_lineage",
        matched_prior_event_id: null,
        matched_prior_version: null,
        lineage_reason: "test",
        canonical_hash: "h",
        artifact_hash: null,
        occurrence_hash: null,
        artifact_id: "a1",
      },
      proof_build_received_at: new Date("2026-01-01T00:00:00.000Z"),
    };

    const proof = minimalProof([
      {
        angle: "deterministic_integrity",
        applicable: true,
        status: "fail",
        reason_code: "DETERMINISTIC_DIGEST_MISMATCH",
        summary: "Deterministic digest did not match baseline.",
        evidence_refs: [],
      },
      {
        angle: "policy_integrity",
        applicable: true,
        status: "fail",
        reason_code: "POLICY_TAGS_MISSING",
        summary: null,
        evidence_refs: [],
      },
      {
        angle: "model_identity_integrity",
        applicable: true,
        status: "not_applicable",
        evidence_refs: [],
      },
      {
        angle: "retrieval_integrity",
        applicable: true,
        status: "not_applicable",
        evidence_refs: [],
      },
      {
        angle: "operational_integrity",
        applicable: true,
        status: "not_applicable",
        evidence_refs: [],
      },
      {
        angle: "identity_access_integrity",
        applicable: true,
        status: "not_applicable",
        evidence_refs: [],
      },
      {
        angle: "cross_system_integrity",
        applicable: true,
        status: "not_applicable",
        evidence_refs: [],
      },
    ]);

    const rollup = buildFailureRollup(proof, pipeline);

    expect(rollup.failed_angles).toEqual(["policy_integrity", "deterministic_integrity"]);
    expect(rollup.primary_failure_category).toBe("MISMATCH");
    expect(rollup.primary_failure_summary).toBe("Deterministic digest did not match baseline.");
    expect(rollup.insights.map((i) => i.angle)).toEqual([
      "deterministic_integrity",
      "policy_integrity",
    ]);
    expect(rollup.insights[0]?.cluster_key).toBe(
      "deterministic_integrity:MISMATCH:DETERMINISTIC_DIGEST_MISMATCH"
    );
  });
});
