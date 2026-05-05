import { describe, expect, it } from "vitest";
import { applyFailuresListDisclosureView, applyProofDisclosureView } from "./proof-disclosure.js";
import { NOT_PROOFABLE_REASON_CODES } from "./not-proofable-reasons.js";
import type { FailureListItem } from "./reconstruct-proof-read.js";

describe("API freeze — reason code registry", () => {
  it("includes all lineage and dedupe reasons used by the pipeline", () => {
    for (const code of [
      "duplicate_event_id_same_hash",
      "duplicate_lineage_version_hash_conflict",
      "lineage_artifact_identity_conflict",
      "ARTIFACT_ID_CONFLICT_WITH_DERIVED",
      "ARTIFACT_ID_NOT_DERIVABLE",
      "mapping_missing",
    ] as const) {
      expect(NOT_PROOFABLE_REASON_CODES).toContain(code);
    }
  });
});

describe("API freeze — disclosure", () => {
  it("external event envelope passes identity through when present", () => {
    const envelope = {
      ok: true,
      canonical_event_type: "action_completed",
      identity: {
        event_id: "e1",
        artifact_id: "a1",
        event_lineage_id: "l1",
        event_version: 1,
        canonical_hash: "h1",
        logical_hash: "h2",
      },
      source_type_key: "s",
      subject_rail: "service",
      proof_units: [],
      product_proof: { proof_status: "verified", angles: [] },
      failure_intelligence: {
        failed_angles: [],
        primary_failure_category: null,
        primary_failure_summary: null,
        insights: [],
      },
    };
    const out = applyProofDisclosureView(envelope, "external");
    expect((out as { identity: unknown }).identity).toEqual(envelope.identity);
  });

  it("GET /failures external shape omits inspection_path", () => {
    const items: FailureListItem[] = [
      {
        id: "fl1",
        proof_id: "p1",
        event_id: "e1",
        angle: "deterministic_integrity",
        failure_zone: "deterministic_integrity",
        subject: "subj",
        host: "h",
        inspection_path: "secret.path",
        created_at: "2026-04-06T00:00:00.000Z",
      },
    ];
    const out = applyFailuresListDisclosureView(
      { items, page: { limit: 20, offset: 0, total: 1 } },
      "external"
    ) as { items: Array<Record<string, unknown>> };
    expect(out.items[0]?.inspection_path).toBeUndefined();
    expect(out.items[0]?.event_id).toBe("e1");
  });
});
