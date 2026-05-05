import { describe, expect, it } from "vitest";
import { applyProofDisclosureView } from "./proof-disclosure.js";

function sampleResponse() {
  return {
    ok: true,
    canonical_event_type: "action_completed",
    source_type_key: "demo.source",
    subject_rail: "service",
    proof_units: [
      {
        proof_id: "p1",
        angle: "deterministic_integrity",
        status: "violated",
        delta_code: "DETERMINISTIC_DIGEST_MISMATCH",
        evidence_json: { internal: true },
        inspection_path: "payload.deterministic",
      },
    ],
    product_proof: {
      proof_status: "failed",
      angles: [
        {
          angle: "deterministic_integrity",
          applicable: true,
          status: "fail",
          reason_code: "DETERMINISTIC_DIGEST_MISMATCH",
          summary: "Deterministic integrity reported a violation.",
        },
      ],
      failure_locator: {
        angle: "deterministic_integrity",
        step: "angle_evaluation",
        reason_code: "DETERMINISTIC_DIGEST_MISMATCH",
        detail: "Internal detail",
      },
      extra: "keep-me",
    },
    failure_intelligence: {
      failed_angles: ["deterministic_integrity"],
      primary_failure_category: "MISMATCH",
      primary_failure_summary: "Deterministic integrity reported a violation.",
      insights: [
        {
          angle: "deterministic_integrity",
          delta_code: "DETERMINISTIC_DIGEST_MISMATCH",
          category: "MISMATCH",
          cluster_key: "deterministic_integrity:MISMATCH:DETERMINISTIC_DIGEST_MISMATCH",
          summary: "Deterministic integrity reported a violation.",
        },
      ],
    },
    failure_rollup: {
      failed_angles: ["deterministic_integrity"],
      primary_failure_category: "MISMATCH",
      primary_failure_summary: "Deterministic integrity reported a violation.",
      insights: [
        {
          angle: "deterministic_integrity",
          delta_code: "DETERMINISTIC_DIGEST_MISMATCH",
          category: "MISMATCH",
          cluster_key: "deterministic_integrity:MISMATCH:DETERMINISTIC_DIGEST_MISMATCH",
          summary: "Deterministic integrity reported a violation.",
        },
      ],
    },
    evidence_refs: ["ev-1"],
    anchor_metadata: {
      anchor_status: "pending",
      anchor_batch_id: null,
      anchor_chain: null,
      anchor_tx_hash: null,
      anchor_timestamp: null,
    },
    linked_events: [
      { event_id: "evt-1", relationship: "canonical" },
      { event_id: "raw-1", relationship: "raw" },
    ],
    status: "failed",
    subject_id: "subj-1",
    event_id: "evt-1",
    raw_event_id: "raw-1",
  };
}

describe("proof disclosure", () => {
  it("internal view returns full response unchanged", () => {
    const input = sampleResponse();
    const out = applyProofDisclosureView(input, "internal");
    expect(out).toBe(input);
    expect(out).toEqual(input);
  });

  it("external view redacts diagnostic details but preserves high-level proof meaning", () => {
    const out = applyProofDisclosureView(sampleResponse(), "external");
    const fi = out.failure_intelligence as {
      insights: Array<Record<string, unknown>>;
      failed_angles: string[];
      primary_failure_category: string;
      primary_failure_summary: string;
    };
    expect(out.ok).toBe(true);
    expect(out.canonical_event_type).toBe("action_completed");
    expect(out.source_type_key).toBe("demo.source");
    expect(out.subject_rail).toBe("service");
    expect(fi.failed_angles).toEqual(["deterministic_integrity"]);
    expect(fi.primary_failure_category).toBe("MISMATCH");
    expect(fi.primary_failure_summary).toBe("Deterministic integrity reported a violation.");
    expect(fi.insights[0]).toEqual({
      angle: "deterministic_integrity",
      delta_code: "DETERMINISTIC_DIGEST_MISMATCH",
      category: "MISMATCH",
      cluster_key: "deterministic_integrity:MISMATCH:DETERMINISTIC_DIGEST_MISMATCH",
      summary: "Deterministic integrity reported a violation.",
    });

    const proofUnits = out.proof_units as Array<Record<string, unknown>>;
    expect(proofUnits[0]?.evidence_json).toBeUndefined();
    expect(proofUnits[0]?.inspection_path).toBeUndefined();

    const pp = out.product_proof as Record<string, unknown>;
    const fl = (pp.failure_locator ?? {}) as Record<string, unknown>;
    expect(fl.angle).toBe("deterministic_integrity");
    expect(fl.step).toBe("angle_evaluation");
    expect(fl.detail).toBe("Internal detail");
    expect(fl.layer).toBeUndefined();
    expect(fl.component).toBeUndefined();
    expect(fl.reason_code).toBe("DETERMINISTIC_DIGEST_MISMATCH");

    const rollup = out.failure_rollup as typeof fi;
    expect(rollup.failed_angles).toEqual(fi.failed_angles);
    expect(out.evidence_refs).toEqual(["ev-1"]);
    expect(out.status).toBe("failed");
    expect(out.subject_id).toBe("subj-1");
    expect(out.linked_events).toHaveLength(2);
  });

  it("minimal view returns only minimal proof surface", () => {
    const out = applyProofDisclosureView(sampleResponse(), "minimal");
    expect(Object.keys(out).sort()).toEqual(["canonical_event_type", "ok", "product_proof"]);
    expect(out.ok).toBe(true);
    expect(out.canonical_event_type).toBe("action_completed");
    expect(out.failure_intelligence).toBeUndefined();
    expect(out.proof_units).toBeUndefined();

    const pp = out.product_proof as Record<string, unknown>;
    expect(Object.keys(pp).sort()).toEqual(["angles", "proof_status"]);
    expect(pp.proof_status).toBe("failed");
    expect(pp.angles).toEqual([
      {
        angle: "deterministic_integrity",
        applicable: true,
        status: "fail",
      },
    ]);
  });

  it("adversarial_safe view returns only low-intelligence proof surface", () => {
    const out = applyProofDisclosureView(sampleResponse(), "adversarial_safe");
    expect(out.ok).toBeDefined();
    expect(out.canonical_event_type).toBeDefined();
    expect(out.product_proof).toBeDefined();
    expect(out.message).toBe("Integrity verification completed.");

    expect(out.proof_units).toBeUndefined();
    expect(out.failure_intelligence).toBeUndefined();
    expect(out.source_type_key).toBeUndefined();
    expect(out.subject_rail).toBeUndefined();

    const pp = out.product_proof as Record<string, unknown>;
    expect(pp.proof_status).toBeDefined();
    expect(Array.isArray(pp.angles)).toBe(true);
    const angles = pp.angles as Array<Record<string, unknown>>;
    for (const angle of angles) {
      expect(Object.keys(angle).sort()).toEqual(["angle", "applicable", "status"]);
      expect(angle.reason_code).toBeUndefined();
      expect(angle.summary).toBeUndefined();
      expect(angle.evidence_refs).toBeUndefined();
    }
  });
});
