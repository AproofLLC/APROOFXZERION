/// <reference path="../vitest-test-globals.d.ts" />
import { randomUUID } from "node:crypto";
import type { PostEventBody } from "../http/events-schema.js";
import type { ProcessEventSuccess } from "../pipeline/process-event.js";
import { buildProductProof, ProductProofInputError } from "./build-product-proof.js";
import { computeProofDigest, toHashableProofPayload } from "./proof-digest.js";
import { PRODUCT_ANGLE_NAMES, validateProductProof, SUBJECT_TYPES } from "./product-proof.js";

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
  const proofId = randomUUID();
  return {
    ok: true,
    source_type_key: "test.policy_checked",
    raw_event_id: randomUUID(),
    event_id: eventId,
    canonical_event_type: "policy_checked",
    subject_rail: "service",
    subject_external_key: null,
    proof_units: [
      {
        proof_id: proofId,
        status: "conformant",
        angle: "policy_integrity",
        delta_code: null,
      },
    ],
    failure_locators_created: 0,
    lineage_anomaly: null,
    lineage: {
      event_id: eventId,
      event_lineage_id: randomUUID(),
      event_version: 1,
      lineage_status: "new_lineage",
      matched_prior_event_id: null,
      matched_prior_version: null,
      lineage_reason: "Test",
      canonical_hash: "hash",
      artifact_hash: null,
      occurrence_hash: null,
      artifact_id: randomUUID(),
    },
    proof_build_received_at: new Date("2026-04-04T12:00:01.000Z"),
    ...overrides,
  };
}

describe("buildProductProof", () => {
  it("always returns exactly seven angles in PRODUCT_ANGLE_NAMES order (completeness regression)", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [],
        canonical_event_type: "action_completed",
      }),
      receivedAt: new Date("2026-04-04T12:00:01.000Z"),
    });
    expect(proof.angles.map((a) => a.angle)).toEqual([...PRODUCT_ANGLE_NAMES]);
    expect(proof.angles).toHaveLength(7);
    const noSourcesAngles = proof.angles.filter((a) => a.reason_code === "NO_SOURCES");
    expect(noSourcesAngles.length).toBeGreaterThanOrEqual(1);
    for (const angle of noSourcesAngles) {
      expect(angle.applicable).toBe(false);
      expect(angle.evidence_refs).toEqual([]);
    }
  });

  it("copies Zerion execution snapshot fields from payload into product_proof and digest material", () => {
    const tx =
      "StubZerionDevnetTxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const recipient = "11111111111111111111111111111111";
    const body = baseBody({
      payload: {
        host: "zerion-agent-demo",
        policy: { tags: ["allow_read"] },
        zerion: { tx_hash: tx, recipient_address: recipient, execution_source: "zerion_cli", cli_invoked: true, execution_attempted: true },
        operational: { execution_status: "success", latency_ms: 10, runtime_error: null },
      },
    });
    const proof = buildProductProof({
      body,
      pipeline: basePipeline(),
      receivedAt: new Date("2026-04-04T12:00:01.000Z"),
    });
    expect(proof.zerion_tx_hash).toBe(tx);
    expect(proof.zerion_recipient_address).toBe(recipient);
    expect(proof.zerion_execution_explorer_url).toBe(
      `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
    );
    expect(proof.operational_execution_status).toBe("success");
    expect(proof.operational_runtime_error).toBeNull();
    const h = toHashableProofPayload(proof);
    expect(h.zerion_tx_hash).toBe(tx);
    expect(h.zerion_recipient_address).toBe(recipient);
    expect(h.operational_runtime_error).toBeNull();
  });

  it("returns a valid ProductProof with seven angles and stable digest", () => {
    const body = baseBody();
    const proof = buildProductProof({
      body,
      pipeline: basePipeline(),
      receivedAt: new Date("2026-04-04T12:00:01.000Z"),
    });
    expect(validateProductProof(proof)).toEqual([]);
    expect(proof.angles).toHaveLength(7);
    expect(proof.proof_status).toBe("verified");
    expect(proof.failure_locator).toBeNull();
    expect(proof.flags_count).toBe(0);
    expect(proof.proof_digest.startsWith("sha256:")).toBe(true);
    const again = computeProofDigest(toHashableProofPayload(proof));
    expect(again).toBe(proof.proof_digest);
  });

  it("maps violated policy to failed proof and sets failure_locator", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "violated",
            angle: "policy_integrity",
            delta_code: "POLICY_TAGS_MISSING",
          },
        ],
      }),
      receivedAt: new Date(),
    });
    expect(proof.proof_status).toBe("failed");
    const policy = proof.angles.find((a) => a.angle === "policy_integrity");
    expect(policy?.status).toBe("fail");
    expect(proof.failure_locator?.step).toBe("policy_evaluation");
    expect(proof.failure_locator?.angle).toBe("policy_integrity");
    expect(proof.flags).toHaveLength(1);
    expect(validateProductProof(proof)).toEqual([]);
  });

  it("maps unverifiable baseline missing to failed with baseline_resolution locator", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "unverifiable",
            angle: "policy_integrity",
            delta_code: "BASELINE_MISSING",
          },
        ],
      }),
      receivedAt: new Date(),
    });
    expect(proof.proof_status).toBe("failed");
    expect(proof.failure_locator?.step).toBe("baseline_resolution");
    expect(proof.failure_locator?.angle).toBe("policy_integrity");
    expect(proof.flags[0]?.code).toBe("BASELINE_MISSING");
  });

  it("chooses earlier policy baseline locator over later no_sources failures", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        canonical_event_type: "policy_checked",
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "unverifiable",
            angle: "policy_integrity",
            delta_code: "BASELINE_MISSING",
          },
          {
            proof_id: randomUUID(),
            status: "unverifiable",
            angle: "retrieval_integrity",
            delta_code: "NO_SOURCES",
          },
        ],
      }),
      receivedAt: new Date(),
    });
    expect(proof.proof_status).toBe("failed");
    expect(proof.failure_locator).toMatchObject({
      angle: "policy_integrity",
      step: "baseline_resolution",
      reason_code: "BASELINE_MISSING",
      detail: "Required baseline row was missing for this angle.",
    });
  });

  it("creates failure_locator for non-policy failed angle", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        canonical_event_type: "action_completed",
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "violated",
            angle: "identity_access_integrity",
            delta_code: "IDENTITY_MISMATCH",
          },
        ],
      }),
      receivedAt: new Date(),
    });
    expect(proof.proof_status).toBe("failed");
    expect(proof.failure_locator?.angle).toBe("identity_access_integrity");
    expect(proof.failure_locator?.step).toBe("identity_check");
    expect(proof.failure_locator?.reason_code).toBe("IDENTITY_MISMATCH");
  });

  it("maps conformant identity_access_integrity to pass with governance note when baseline missing", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "identity_access_integrity",
            delta_code: null,
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const identity = proof.angles.find((a) => a.angle === "identity_access_integrity");
    expect(identity?.status).toBe("pass");
  });

  it("maps violated identity_access_integrity to fail", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "violated",
            angle: "identity_access_integrity",
            delta_code: "IDENTITY_ACCESS_SCOPES_MISSING",
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const identity = proof.angles.find((a) => a.angle === "identity_access_integrity");
    expect(identity?.status).toBe("fail");
  });

  it("maps conformant operational_integrity to pass with governance note when baseline missing", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "operational_integrity",
            delta_code: null,
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const operational = proof.angles.find((a) => a.angle === "operational_integrity");
    expect(operational?.status).toBe("pass");
  });

  it("maps violated operational_integrity to fail", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "violated",
            angle: "operational_integrity",
            delta_code: "OPERATIONAL_LATENCY_EXCEEDED",
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const operational = proof.angles.find((a) => a.angle === "operational_integrity");
    expect(operational?.status).toBe("fail");
  });

  it("maps conformant model_identity_integrity to pass with governance note when baseline missing", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "model_identity_integrity",
            delta_code: null,
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const modelIdentity = proof.angles.find((a) => a.angle === "model_identity_integrity");
    expect(modelIdentity?.status).toBe("pass");
  });

  it("maps violated model_identity_integrity to fail", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "violated",
            angle: "model_identity_integrity",
            delta_code: "MODEL_IDENTITY_MISMATCH",
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const modelIdentity = proof.angles.find((a) => a.angle === "model_identity_integrity");
    expect(modelIdentity?.status).toBe("fail");
  });

  it("maps conformant retrieval_integrity to pass with governance note when baseline missing", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "retrieval_integrity",
            delta_code: null,
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const retrieval = proof.angles.find((a) => a.angle === "retrieval_integrity");
    expect(retrieval?.status).toBe("pass");
  });

  it("maps violated retrieval_integrity to fail", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "violated",
            angle: "retrieval_integrity",
            delta_code: "RETRIEVAL_EXPECTED_SOURCE_MISSING",
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const retrieval = proof.angles.find((a) => a.angle === "retrieval_integrity");
    expect(retrieval?.status).toBe("fail");
  });

  it("maps conformant deterministic_integrity to pass with governance note when baseline missing", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "deterministic_integrity",
            delta_code: null,
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const deterministic = proof.angles.find((a) => a.angle === "deterministic_integrity");
    expect(deterministic?.status).toBe("pass");
  });

  it("maps violated deterministic_integrity to fail", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "violated",
            angle: "deterministic_integrity",
            delta_code: "DETERMINISTIC_DIGEST_MISMATCH",
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const deterministic = proof.angles.find((a) => a.angle === "deterministic_integrity");
    expect(deterministic?.status).toBe("fail");
  });

  it("maps conformant cross_system_integrity to pass with governance note when baseline missing", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "cross_system_integrity",
            delta_code: null,
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const crossSystem = proof.angles.find((a) => a.angle === "cross_system_integrity");
    expect(crossSystem?.status).toBe("pass");
  });

  it("maps violated cross_system_integrity to fail", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline({
        proof_units: [
          {
            proof_id: randomUUID(),
            status: "conformant",
            angle: "policy_integrity",
            delta_code: null,
          },
          {
            proof_id: randomUUID(),
            status: "violated",
            angle: "cross_system_integrity",
            delta_code: "CROSS_SYSTEM_EXPECTED_SYSTEM_MISSING",
          },
        ],
      }),
      receivedAt: new Date(),
    });
    const crossSystem = proof.angles.find((a) => a.angle === "cross_system_integrity");
    expect(crossSystem?.status).toBe("fail");
  });

  it("includes contract validation fields in proof", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline(),
      receivedAt: new Date(),
    });
    expect(proof.contract_valid).toBe(true);
    expect(proof.contract_failure_reason).toBe(null);
  });

  it("does not expose invalid contract proofs from the builder", () => {
    const proof = buildProductProof({
      body: baseBody(),
      pipeline: basePipeline(),
      receivedAt: new Date(),
    });
    expect(proof.contract_valid).toBe(true);
    expect(proof.contract_failure_reason).toBe(null);
  });

  it("maps all subject rail types to correct SubjectType", () => {
    const rails: Array<"model" | "agent" | "service" | "endpoint" | "system"> = ["model", "agent", "service", "endpoint", "system"];
    const expectedSubjects = ["model", "agent", "service", "endpoint", "system"] as const;

    rails.forEach((rail, index) => {
      const proof = buildProductProof({
        body: baseBody(),
        pipeline: basePipeline({ subject_rail: rail }),
        receivedAt: new Date(),
      });
      expect(proof.subject_type).toBe(expectedSubjects[index]);
    });
  });

  it("throws ProductProofInputError EVENT_IDENTITY_REQUIRED when pipeline.lineage is missing", () => {
    const p = basePipeline();
    const bad = { ...p, lineage: undefined as unknown as ProcessEventSuccess["lineage"] };
    expect(() =>
      buildProductProof({
        body: baseBody(),
        pipeline: bad,
        receivedAt: new Date(),
      })
    ).toThrow(ProductProofInputError);
    try {
      buildProductProof({ body: baseBody(), pipeline: bad, receivedAt: new Date() });
    } catch (e) {
      expect(e).toBeInstanceOf(ProductProofInputError);
      expect((e as ProductProofInputError).code).toBe("EVENT_IDENTITY_REQUIRED");
    }
  });

  it("throws ProductProofInputError EVENT_IDENTITY_INCOMPLETE when lineage_reason is missing", () => {
    const p = basePipeline();
    const bad = {
      ...p,
      lineage: { ...p.lineage, lineage_reason: null as unknown as string },
    };
    expect(() =>
      buildProductProof({
        body: baseBody(),
        pipeline: bad,
        receivedAt: new Date(),
      })
    ).toThrow(ProductProofInputError);
    try {
      buildProductProof({ body: baseBody(), pipeline: bad, receivedAt: new Date() });
    } catch (e) {
      expect((e as ProductProofInputError).code).toBe("EVENT_IDENTITY_INCOMPLETE");
      expect((e as ProductProofInputError).detail).toBe("lineage_reason");
    }
  });

  it("throws ProductProofInputError EVENT_IDENTITY_INCOMPLETE when event_lineage_id is missing", () => {
    const p = basePipeline();
    const bad = {
      ...p,
      lineage: { ...p.lineage, event_lineage_id: "" },
    };
    expect(() =>
      buildProductProof({
        body: baseBody(),
        pipeline: bad,
        receivedAt: new Date(),
      })
    ).toThrow(ProductProofInputError);
    try {
      buildProductProof({ body: baseBody(), pipeline: bad, receivedAt: new Date() });
    } catch (e) {
      expect((e as ProductProofInputError).code).toBe("EVENT_IDENTITY_INCOMPLETE");
      expect((e as ProductProofInputError).detail).toBe("event_lineage_id");
    }
  });
});
