import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PostEventBody } from "../http/events-schema.js";
import type { ProcessEventSuccess } from "../pipeline/process-event.js";
import { buildProductProof } from "./build-product-proof.js";
import { mapDeltaCodeToFailureCategory } from "./failure-intelligence.js";

function baseBody(overrides: Partial<PostEventBody> = {}): PostEventBody {
  return {
    organization_id: randomUUID(),
    environment_id: randomUUID(),
    source_type_key: "test.policy_checked",
    subject_id: randomUUID(),
    event_lineage_id: randomUUID(),
    event_version: 1,
    trace_id: "trace-1",
    occurred_at: new Date("2026-04-04T12:00:00.000Z"),
    payload: { host: "h1", policy: { tags: ["allow_read"] } },
    ...overrides,
  };
}

function basePipeline(overrides: Partial<ProcessEventSuccess> = {}): ProcessEventSuccess {
  const eventId = randomUUID();
  return {
    ok: true,
    source_type_key: "test.policy_checked",
    raw_event_id: randomUUID(),
    event_id: eventId,
    canonical_event_type: "policy_checked",
    subject_rail: "service",
    subject_external_key: null,
    proof_units: [],
    failure_locators_created: 0,
    lineage_anomaly: null,
    lineage: {
      event_id: eventId,
      event_lineage_id: randomUUID(),
      event_version: 1,
      lineage_status: "new_lineage",
      matched_prior_event_id: null,
      matched_prior_version: null,
      lineage_reason: "test proof semantics",
      canonical_hash: "hash",
      artifact_hash: null,
      occurrence_hash: null,
      artifact_id: randomUUID(),
    },
    proof_build_received_at: new Date("2026-04-04T12:00:01.000Z"),
    ...overrides,
  };
}

describe("proof semantics", () => {
  it("insufficient_evidence uses NO_SOURCES when angle has no event evidence", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({ canonical_event_type: "action_completed", proof_units: [] }),
      receivedAt: new Date("2026-04-04T12:00:01.000Z"),
    });
    const retrieval = proof.angles.find((a) => a.angle === "retrieval_integrity");
    expect(retrieval?.status).toBe("insufficient_evidence");
    expect(retrieval?.reason_code).toBe("NO_SOURCES");
  });

  it("insufficient_evidence uses INSUFFICIENT_PIPELINE_WIRING_ERROR for expected evaluator path missing", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({ canonical_event_type: "policy_checked", proof_units: [] }),
      receivedAt: new Date("2026-04-04T12:00:01.000Z"),
    });
    const policy = proof.angles.find((a) => a.angle === "policy_integrity");
    expect(policy?.status).toBe("insufficient_evidence");
    expect(policy?.reason_code).toBe("INSUFFICIENT_PIPELINE_WIRING_ERROR");
  });

  it("fail means evaluator violation was produced", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        canonical_event_type: "action_completed",
        proof_units: [
          {
            proof_id: randomUUID(),
            angle: "deterministic_integrity",
            status: "violated",
            delta_code: "DETERMINISTIC_DIGEST_MISMATCH",
          },
        ],
      }),
      receivedAt: new Date("2026-04-04T12:00:01.000Z"),
    });
    const deterministic = proof.angles.find((a) => a.angle === "deterministic_integrity");
    expect(deterministic?.status).toBe("fail");
    expect(deterministic?.reason_code).toBe("DETERMINISTIC_DIGEST_MISMATCH");
  });

  it("baseline/config missing maps to CONFIG_MISSING", () => {
    expect(mapDeltaCodeToFailureCategory("BASELINE_MISSING")).toBe("CONFIG_MISSING");
    expect(mapDeltaCodeToFailureCategory("POLICY_BASELINE_SHAPE")).toBe("CONFIG_MISSING");
  });

  it("malformed evidence maps to PAYLOAD_MISSING category", () => {
    expect(mapDeltaCodeToFailureCategory("POLICY_OBSERVED_SHAPE")).toBe("PAYLOAD_MISSING");
    expect(mapDeltaCodeToFailureCategory("IDENTITY_ACCESS_OBSERVED_SHAPE")).toBe("PAYLOAD_MISSING");
  });

  it("NO_SOURCES maps to PAYLOAD_MISSING category", () => {
    expect(mapDeltaCodeToFailureCategory("NO_SOURCES")).toBe("PAYLOAD_MISSING");
  });
});
