/**
 * End-to-end adversarial hardening checks for /events input handling.
 * Default: in-memory PGlite (no env). Optional: E2E_DATABASE_URL for real Postgres.
 */
import { createHash, randomUUID } from "node:crypto";
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createDb, type Db } from "../src/db/client.js";
import { buildServer } from "../src/http/server.js";
import {
  apiKeys,
  baselines,
  environments,
  mappingRules,
  organizations,
  subjects,
} from "../src/db/schema/index.js";
import type { FastifyInstance } from "fastify";
import { validateProductProof } from "../src/product/product-proof.js";

const e2eUrl = process.env.E2E_DATABASE_URL?.trim();

async function closeDb(db: Db) {
  if (db.$client instanceof Pool) {
    await db.$client.end();
  } else {
    await db.$client.close();
  }
}

describe("e2e: adversarial inputs", () => {
  let db: Db | undefined;
  let app: FastifyInstance | undefined;
  let apiKeyPlain: string;
  let orgId: string;
  let envId: string;
  let subjectFullId: string;
  let subjectMissingBaselineId: string;

  function baseEnvelope(input: {
    source_type_key: string;
    subject_id?: string;
    occurred_at?: string;
    payload?: Record<string, unknown>;
  }) {
    return {
      organization_id: orgId,
      environment_id: envId,
      source_type_key: input.source_type_key,
      subject_id: input.subject_id ?? subjectFullId,
      event_lineage_id: randomUUID(),
      event_version: 1,
      trace_id: `e2e-adversarial-${randomUUID()}`,
      occurred_at: input.occurred_at ?? "2026-04-02T12:00:00.000Z",
      payload:
        input.payload ??
        ({
          host: "e2e",
          record_id: "e2e-adversarial-record",
          deterministic: { observed_digest: "abc123" },
          policy: { tags: ["allow_read"] },
          operational: {
            execution_status: "success",
            latency_ms: 100,
            runtime_error: null,
          },
          model_identity: { observed_model: "gpt-4.1-mini" },
          cross_system: { observed_systems: ["crm", "billing"] },
          identity_access: {
            principal_id: "user_123",
            granted_scopes: ["read:proofs", "write:proofs"],
            tenant_id: "tenant_a",
            token_valid: true,
            token_expired: false,
            access_log_present: true,
          },
        } as Record<string, unknown>),
    };
  }

  async function postRaw(payload: unknown) {
    return app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "x-api-key": apiKeyPlain,
        "content-type": "application/json",
      },
      payload,
    });
  }

  beforeAll(async () => {
    if (e2eUrl) {
      db = createDb(e2eUrl);
    } else {
      const { openPgliteMemory } = await import("../src/db/pglite.js");
      const opened = await openPgliteMemory();
      db = opened.db;
    }

    orgId = randomUUID();
    envId = randomUUID();
    subjectFullId = randomUUID();
    subjectMissingBaselineId = randomUUID();
    apiKeyPlain = `e2e_${randomUUID()}`;
    const keyHash = createHash("sha256").update(apiKeyPlain, "utf8").digest("hex");
    const keyPrefix = apiKeyPlain.slice(0, 8);

    await db.insert(organizations).values({ id: orgId, name: `e2e-org-${orgId.slice(0, 8)}` });
    await db.insert(environments).values({ id: envId, organizationId: orgId, name: "e2e-env" });
    await db.insert(subjects).values([
      {
        id: subjectFullId,
        organizationId: orgId,
        environmentId: envId,
        railType: "service",
        externalKey: `e2e-ext-full-${subjectFullId.slice(0, 8)}`,
      },
      {
        id: subjectMissingBaselineId,
        organizationId: orgId,
        environmentId: envId,
        railType: "service",
        externalKey: `e2e-ext-partial-${subjectMissingBaselineId.slice(0, 8)}`,
      },
    ]);

    await db.insert(mappingRules).values([
      {
        organizationId: orgId,
        environmentId: envId,
        sourceTypeKey: "e2e.adversarial.action",
        canonicalEventType: "action_completed",
        isActive: true,
      },
      {
        organizationId: orgId,
        environmentId: envId,
        sourceTypeKey: "e2e.adversarial.retrieval",
        canonicalEventType: "retrieval_completed",
        isActive: true,
      },
    ]);

    const allBaselines = [
      {
        angle: "policy_integrity" as const,
        definition: { type: "policy_integrity_v1", required_tags: ["allow_read"] },
      },
      {
        angle: "identity_access_integrity" as const,
        definition: {
          type: "identity_access_integrity_v1",
          required_scopes: ["read:proofs"],
          expected_tenant_id: "tenant_a",
          require_access_log: true,
        },
      },
      {
        angle: "operational_integrity" as const,
        definition: {
          type: "operational_integrity_v1",
          expected_status: "success",
          max_latency_ms: 2000,
          require_no_runtime_error: true,
        },
      },
      {
        angle: "model_identity_integrity" as const,
        definition: {
          type: "model_identity_integrity_v1",
          expected_model: "gpt-4.1-mini",
          require_exact_match: true,
        },
      },
      {
        angle: "retrieval_integrity" as const,
        definition: {
          type: "retrieval_integrity_v1",
          expected_sources: ["db", "cache"],
          min_sources: 2,
        },
      },
      {
        angle: "deterministic_integrity" as const,
        definition: {
          type: "deterministic_integrity_v1",
          expected_digest: "abc123",
          algorithm: "sha256",
          require_exact_match: true,
        },
      },
      {
        angle: "cross_system_integrity" as const,
        definition: {
          type: "cross_system_integrity_v1",
          expected_systems: ["crm", "billing"],
          require_all_systems: true,
        },
      },
    ];

    await db.insert(baselines).values(
      allBaselines.map((b) => ({
        organizationId: orgId,
        environmentId: envId,
        subjectId: subjectFullId,
        angle: b.angle,
        version: 1,
        definition: b.definition,
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        effectiveTo: null,
      }))
    );

    await db.insert(baselines).values(
      allBaselines
        .filter((b) => b.angle !== "cross_system_integrity")
        .map((b) => ({
          organizationId: orgId,
          environmentId: envId,
          subjectId: subjectMissingBaselineId,
          angle: b.angle,
          version: 1,
          definition: b.definition,
          effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
          effectiveTo: null,
        }))
    );

    await db.insert(apiKeys).values({
      organizationId: orgId,
      environmentId: envId,
      name: "e2e",
      keyPrefix,
      keyHash,
    });

    app = buildServer(db);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    if (db) await closeDb(db);
  });

  it("request rejected when source_type_key is unknown", async () => {
    const res = await postRaw(
      baseEnvelope({
        source_type_key: "e2e.adversarial.unknown_source",
      })
    );
    expect(res.statusCode).toBe(422);
    const body = res.json() as {
      ok: false;
      error: { code: string; details?: { reason: string } };
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_PROOFABLE");
    expect(typeof body.error.details?.reason).toBe("string");
    expect((body.error.details?.reason ?? "").length).toBeGreaterThan(0);
  });

  it("request rejected when body shape is malformed at top level", async () => {
    const missingPayload = await postRaw({
      ...baseEnvelope({ source_type_key: "e2e.adversarial.action" }),
      payload: undefined,
    });
    expect(missingPayload.statusCode).toBe(400);
    expect((missingPayload.json() as { error: { code: string } }).error.code).toBe("INVALID_BODY");

    const missingSubject = await postRaw({
      ...baseEnvelope({ source_type_key: "e2e.adversarial.action" }),
      subject_id: undefined,
    });
    expect(missingSubject.statusCode).toBe(400);
    expect((missingSubject.json() as { error: { code: string } }).error.code).toBe("INVALID_BODY");

    const invalidOccurredAt = await postRaw({
      ...baseEnvelope({ source_type_key: "e2e.adversarial.action" }),
      occurred_at: "not-a-date",
    });
    expect(invalidOccurredAt.statusCode).toBe(400);
    expect((invalidOccurredAt.json() as { error: { code: string } }).error.code).toBe("INVALID_BODY");
  });

  it("active angle path with missing baseline is handled safely", async () => {
    const res = await postRaw(
      baseEnvelope({
        source_type_key: "e2e.adversarial.action",
        subject_id: subjectMissingBaselineId,
      })
    );
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      proof_units: { angle: string; status: string; delta_code: string | null }[];
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(body.ok).toBe(true);
    const crossSystemUnit = body.proof_units.find((u) => u.angle === "cross_system_integrity");
    expect(crossSystemUnit).toBeDefined();
    expect(crossSystemUnit?.status).not.toBe("unverifiable");
    expect(validateProductProof(body.product_proof)).toEqual([]);
  });

  it("malformed nested payloads are handled safely", async () => {
    const actionRes = await postRaw(
      baseEnvelope({
        source_type_key: "e2e.adversarial.action",
        payload: {
          host: "e2e",
          record_id: "e2e-adversarial-record",
          deterministic: { observed_digest: 123 },
          model_identity: { observed_model: { bad: true } },
          cross_system: { observed_systems: null },
          operational: {
            execution_status: "success",
            latency_ms: 100,
            runtime_error: null,
          },
          policy: { tags: ["allow_read"] },
          identity_access: {
            principal_id: "user_123",
            granted_scopes: ["read:proofs"],
            tenant_id: "tenant_a",
            token_valid: true,
            token_expired: false,
            access_log_present: true,
          },
        },
      })
    );
    expect(actionRes.statusCode).toBe(201);
    const actionBody = actionRes.json() as {
      proof_units: { angle: string; status: string; delta_code: string | null }[];
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(actionBody.proof_units.find((u) => u.angle === "deterministic_integrity")?.delta_code).toBe(
      "DETERMINISTIC_DIGEST_MISSING"
    );
    expect(actionBody.proof_units.find((u) => u.angle === "model_identity_integrity")?.delta_code).toBe(
      "MODEL_IDENTITY_MISSING"
    );
    expect(actionBody.proof_units.find((u) => u.angle === "cross_system_integrity")?.delta_code).toBe(
      "CROSS_SYSTEM_SYSTEMS_MISSING"
    );
    expect(validateProductProof(actionBody.product_proof)).toEqual([]);

    const retrievalRes = await postRaw(
      baseEnvelope({
        source_type_key: "e2e.adversarial.retrieval",
        payload: {
          host: "e2e",
          record_id: "e2e-adversarial-record",
          retrieval: { retrieved_sources: "db" },
        },
      })
    );
    expect(retrievalRes.statusCode).toBe(201);
    const retrievalBody = retrievalRes.json() as {
      proof_units: { angle: string; status: string; delta_code: string | null }[];
    };
    expect(retrievalBody.proof_units.find((u) => u.angle === "retrieval_integrity")?.delta_code).toBe(
      "RETRIEVAL_NO_SOURCES"
    );
  });

  it("partial multi-angle payload is handled without crash", async () => {
    const res = await postRaw(
      baseEnvelope({
        source_type_key: "e2e.adversarial.action",
        payload: {
          host: "e2e",
          record_id: "e2e-adversarial-record",
          deterministic: { observed_digest: "abc123" },
          operational: {
            execution_status: "success",
            latency_ms: 100,
            runtime_error: null,
          },
        },
      })
    );
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      proof_units: { angle: string; status: string }[];
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(body.proof_units.find((u) => u.angle === "deterministic_integrity")?.status).toBe("conformant");
    expect(body.proof_units.find((u) => u.angle === "operational_integrity")?.status).toBe("conformant");
    expect(body.proof_units.find((u) => u.angle === "model_identity_integrity")?.status).toBe("violated");
    expect(validateProductProof(body.product_proof)).toEqual([]);
  });

  it("extra unknown fields are handled deterministically", async () => {
    const res = await postRaw(
      baseEnvelope({
        source_type_key: "e2e.adversarial.action",
        payload: {
          host: "e2e",
          record_id: "e2e-adversarial-record",
          deterministic: { observed_digest: "abc123" },
          operational: {
            execution_status: "success",
            latency_ms: 100,
            runtime_error: null,
          },
          policy: { tags: ["allow_read"] },
          model_identity: { observed_model: "gpt-4.1-mini" },
          cross_system: { observed_systems: ["crm", "billing"] },
          identity_access: {
            principal_id: "user_123",
            granted_scopes: ["read:proofs", "write:proofs"],
            tenant_id: "tenant_a",
            token_valid: true,
            token_expired: false,
            access_log_present: true,
          },
          unexpected_blob: {
            random: ["x", "y", { z: 1 }],
            nested: { garbage: true },
          },
        },
      })
    );
    expect(res.statusCode).toBe(201);
    const body = res.json() as { ok: boolean; product_proof: import("../src/product/product-proof.js").ProductProof };
    expect(body.ok).toBe(true);
    expect(validateProductProof(body.product_proof)).toEqual([]);
  });

  it("malformed but non-crashing stress case returns deterministic response shapes", async () => {
    const templates: Record<string, unknown>[] = [
      baseEnvelope({
        source_type_key: "e2e.adversarial.unknown_source",
      }),
      {
        ...baseEnvelope({ source_type_key: "e2e.adversarial.action" }),
        occurred_at: "not-a-date",
      },
      baseEnvelope({
        source_type_key: "e2e.adversarial.action",
        payload: {
          host: "e2e",
          record_id: "e2e-adversarial-record",
          deterministic: { observed_digest: 999 },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      }),
      baseEnvelope({
        source_type_key: "e2e.adversarial.retrieval",
        payload: {
          host: "e2e",
          record_id: "e2e-adversarial-record",
          retrieval: { retrieved_sources: "bad" },
        },
      }),
      baseEnvelope({
        source_type_key: "e2e.adversarial.action",
        payload: {
          host: "e2e",
          record_id: "e2e-adversarial-record",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
          cross_system: { observed_systems: [] },
        },
      }),
    ];
    const requests = [...templates, ...templates];

    const responses = await Promise.all(requests.map((payload) => postRaw(payload)));
    expect(responses).toHaveLength(10);

    const signatures = new Set<string>();
    for (const res of responses) {
      const body = res.json() as Record<string, unknown>;
      expect(typeof body).toBe("object");
      expect(body).not.toBeNull();
      const keys = Object.keys(body).sort().join(",");
      signatures.add(`${res.statusCode}:${keys}`);

      if (res.statusCode === 201) {
        expect(typeof body.ok).toBe("boolean");
        expect(typeof body.product_proof).toBe("object");
      } else if (res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 403) {
        expect(body.ok).toBe(false);
        expect(typeof (body as { error?: { code?: string } }).error).toBe("object");
      } else if (res.statusCode === 422) {
        expect(body.ok).toBe(false);
        expect(typeof (body as { error?: { code?: string } }).error?.code).toBe("string");
      } else {
        throw new Error(`Unexpected status code ${res.statusCode}`);
      }
    }

    expect(signatures.size).toBeGreaterThan(1);
  });
});
