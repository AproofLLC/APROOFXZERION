/**
 * End-to-end: POST /events → proofability gate → canonical row → multi-angle proof behavior under concurrency.
 * Default: in-memory PGlite (no env). Optional: E2E_DATABASE_URL for real Postgres.
 * This file is the stress harness for concurrent multi-angle proof behavior. Every new angle added to the system should eventually survive this test.
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
const CONCURRENCY = 25;
const SOURCE_TYPE_KEY = "e2e.multi_angle_stress";
const RETRIEVAL_SOURCE_TYPE_KEY = "e2e.multi_angle_stress_retrieval";

type E2eBody = {
  ok: boolean;
  canonical_event_type: string;
  subject_rail: string;
  proof_units: { proof_id: string; status: string; angle: string; delta_code: string | null }[];
  product_proof: import("../src/product/product-proof.js").ProductProof;
};

async function closeDb(db: Db) {
  if (db.$client instanceof Pool) {
    await db.$client.end();
  } else {
    await db.$client.close();
  }
}

describe("e2e: multi-angle stress behavior", () => {
  let db: Db | undefined;
  let app: FastifyInstance | undefined;
  let apiKeyPlain: string;
  let orgId: string;
  let envId: string;
  let subjectId: string;

  async function postEvent(payload: Record<string, unknown>, sourceTypeKey = SOURCE_TYPE_KEY) {
    return app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "x-api-key": apiKeyPlain,
        "content-type": "application/json",
      },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: sourceTypeKey,
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: `e2e-trace-stress-${randomUUID()}`,
        occurred_at: new Date().toISOString(),
        payload,
      },
    });
  }

  function getProofUnit(
    body: E2eBody,
    angle:
      | "deterministic_integrity"
      | "policy_integrity"
      | "identity_access_integrity"
      | "operational_integrity"
      | "model_identity_integrity"
      | "retrieval_integrity"
      | "cross_system_integrity"
  ) {
    return body.proof_units.find((u) => u.angle === angle);
  }

  function getProductAngle(
    body: E2eBody,
    angle:
      | "deterministic_integrity"
      | "policy_integrity"
      | "identity_access_integrity"
      | "operational_integrity"
      | "model_identity_integrity"
      | "retrieval_integrity"
      | "cross_system_integrity"
  ) {
    return body.product_proof.angles.find((a) => a.angle === angle);
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
    subjectId = randomUUID();
    apiKeyPlain = `e2e_${randomUUID()}`;
    const keyHash = createHash("sha256").update(apiKeyPlain, "utf8").digest("hex");
    const keyPrefix = apiKeyPlain.slice(0, 8);

    await db.insert(organizations).values({ id: orgId, name: `e2e-org-${orgId.slice(0, 8)}` });
    await db.insert(environments).values({ id: envId, organizationId: orgId, name: "e2e-env" });
    await db.insert(subjects).values({
      id: subjectId,
      organizationId: orgId,
      environmentId: envId,
      railType: "service",
      externalKey: `e2e-ext-${subjectId.slice(0, 8)}`,
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: SOURCE_TYPE_KEY,
      canonicalEventType: "action_completed",
      isActive: true,
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: RETRIEVAL_SOURCE_TYPE_KEY,
      canonicalEventType: "retrieval_completed",
      isActive: true,
    });
    await db.insert(baselines).values({
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "cross_system_integrity",
      version: 1,
      definition: {
        type: "cross_system_integrity_v1",
        expected_systems: ["crm", "billing"],
        require_all_systems: true,
      },
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      effectiveTo: null,
    });
    await db.insert(baselines).values({
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "deterministic_integrity",
      version: 1,
      definition: {
        type: "deterministic_integrity_v1",
        expected_digest: "abc123",
        algorithm: "sha256",
        require_exact_match: true,
      },
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      effectiveTo: null,
    });
    await db.insert(baselines).values({
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "policy_integrity",
      version: 1,
      definition: {
        type: "policy_integrity_v1",
        required_tags: ["allow_read"],
      },
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      effectiveTo: null,
    });
    await db.insert(baselines).values({
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "identity_access_integrity",
      version: 1,
      definition: {
        type: "identity_access_integrity_v1",
        required_scopes: ["read:proofs"],
        expected_tenant_id: "tenant_a",
        require_access_log: true,
      },
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      effectiveTo: null,
    });
    await db.insert(baselines).values({
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "operational_integrity",
      version: 1,
      definition: {
        type: "operational_integrity_v1",
        expected_status: "success",
        max_latency_ms: 2000,
        require_no_runtime_error: true,
      },
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      effectiveTo: null,
    });
    await db.insert(baselines).values({
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "model_identity_integrity",
      version: 1,
      definition: {
        type: "model_identity_integrity_v1",
        expected_model: "gpt-4.1-mini",
        require_exact_match: true,
      },
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      effectiveTo: null,
    });
    await db.insert(baselines).values({
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "retrieval_integrity",
      version: 1,
      definition: {
        type: "retrieval_integrity_v1",
        expected_sources: ["db", "cache"],
        min_sources: 2,
      },
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      effectiveTo: null,
    });
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

  it("handles 25 concurrent conformant multi-angle events", async () => {
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        postEvent({
          host: "e2e",
          record_id: "e2e-stress-record",
          request_id: `stress-conformant-${i}`,
          deterministic: {
            observed_digest: "abc123",
          },
          cross_system: {
            observed_systems: ["crm", "billing"],
          },
          policy: { tags: ["allow_read"] },
          operational: {
            execution_status: "success",
            latency_ms: 100,
            runtime_error: null,
          },
          model_identity: {
            observed_model: "gpt-4.1-mini",
          },
          retrieval: {
            retrieved_sources: ["db", "cache"],
          },
          identity_access: {
            principal_id: "user_123",
            granted_scopes: ["read:proofs", "write:proofs"],
            tenant_id: "tenant_a",
            token_valid: true,
            token_expired: false,
            access_log_present: true,
          },
        })
      )
    );

    expect(responses).toHaveLength(CONCURRENCY);
    let malformedCount = 0;
    for (const res of responses) {
      expect(res.statusCode).toBe(201);
      const body = res.json() as E2eBody;
      if (!body || !Array.isArray(body.proof_units) || !body.product_proof) {
        malformedCount += 1;
        continue;
      }
      expect(body.ok).toBe(true);
      expect(body.canonical_event_type).toBe("action_completed");
      expect(body.subject_rail).toBe("service");

      const policyUnit = getProofUnit(body, "policy_integrity");
      const identityUnit = getProofUnit(body, "identity_access_integrity");
      const operationalUnit = getProofUnit(body, "operational_integrity");
      const modelIdentityUnit = getProofUnit(body, "model_identity_integrity");
      const deterministicUnit = getProofUnit(body, "deterministic_integrity");
      const crossSystemUnit = getProofUnit(body, "cross_system_integrity");
      expect(policyUnit?.status).toBe("conformant");
      expect(identityUnit?.status).toBe("conformant");
      expect(operationalUnit?.status).toBe("conformant");
      expect(modelIdentityUnit?.status).toBe("conformant");
      expect(deterministicUnit?.status).toBe("conformant");
      expect(crossSystemUnit?.status).toBe("conformant");

      expect(validateProductProof(body.product_proof)).toEqual([]);
      expect(getProductAngle(body, "policy_integrity")?.status).toBe("pass");
      expect(getProductAngle(body, "identity_access_integrity")?.status).toBe("pass");
      expect(getProductAngle(body, "operational_integrity")?.status).toBe("pass");
      expect(getProductAngle(body, "model_identity_integrity")?.status).toBe("pass");
      expect(getProductAngle(body, "deterministic_integrity")?.status).toBe("pass");
      expect(getProductAngle(body, "cross_system_integrity")?.status).toBe("pass");
    }
    expect(malformedCount).toBe(0);
  });

  it("handles 25 concurrent mixed-status multi-angle events", async () => {
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        postEvent({
          host: "e2e",
          record_id: "e2e-stress-record",
          request_id: `stress-mixed-${i}`,
          deterministic: {
            observed_digest: "abc123",
          },
          cross_system: {
            observed_systems: ["crm", "billing"],
          },
          policy: { tags: ["allow_read"] },
          operational: {
            execution_status: "success",
            latency_ms: 100,
            runtime_error: null,
          },
          model_identity: {
            observed_model: "gpt-4.1-mini",
          },
          retrieval: {
            retrieved_sources: ["db", "cache"],
          },
          identity_access: {
            principal_id: "user_123",
            granted_scopes: i % 2 === 0 ? ["read:proofs", "write:proofs"] : ["write:proofs"],
            tenant_id: "tenant_a",
            token_valid: true,
            token_expired: false,
            access_log_present: true,
          },
        })
      )
    );

    expect(responses).toHaveLength(CONCURRENCY);
    let malformedCount = 0;
    for (const [i, res] of responses.entries()) {
      expect(res.statusCode).toBe(201);
      const body = res.json() as E2eBody;
      if (!body || !Array.isArray(body.proof_units) || !body.product_proof) {
        malformedCount += 1;
        continue;
      }
      expect(body.ok).toBe(true);
      expect(body.canonical_event_type).toBe("action_completed");
      expect(body.subject_rail).toBe("service");
      expect(validateProductProof(body.product_proof)).toEqual([]);

      const policyUnit = getProofUnit(body, "policy_integrity");
      const identityUnit = getProofUnit(body, "identity_access_integrity");
      const operationalUnit = getProofUnit(body, "operational_integrity");
      const modelIdentityUnit = getProofUnit(body, "model_identity_integrity");
      const deterministicUnit = getProofUnit(body, "deterministic_integrity");
      const crossSystemUnit = getProofUnit(body, "cross_system_integrity");
      expect(policyUnit?.status).toBe("conformant");
      expect(operationalUnit?.status).toBe("conformant");
      expect(modelIdentityUnit?.status).toBe("conformant");
      expect(deterministicUnit?.status).toBe("conformant");
      expect(crossSystemUnit?.status).toBe("conformant");
      expect(getProductAngle(body, "policy_integrity")?.status).toBe("pass");
      expect(getProductAngle(body, "operational_integrity")?.status).toBe("pass");
      expect(getProductAngle(body, "model_identity_integrity")?.status).toBe("pass");
      expect(getProductAngle(body, "deterministic_integrity")?.status).toBe("pass");
      expect(getProductAngle(body, "cross_system_integrity")?.status).toBe("pass");

      if (i % 2 === 0) {
        expect(identityUnit?.status).toBe("conformant");
        expect(getProductAngle(body, "identity_access_integrity")?.status).toBe("pass");
      } else {
        expect(identityUnit?.status).toBe("violated");
        expect(identityUnit?.delta_code).toBe("IDENTITY_ACCESS_SCOPES_MISSING");
        expect(getProductAngle(body, "identity_access_integrity")?.status).toBe("fail");
      }
    }
    expect(malformedCount).toBe(0);
  });

  it("handles 25 concurrent conformant retrieval_integrity events", async () => {
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        postEvent(
          {
            host: "e2e",
          record_id: "e2e-stress-record",
            request_id: `stress-retrieval-${i}`,
            policy: { tags: ["allow_read"] },
            retrieval: {
              retrieved_sources: ["db", "cache"],
            },
            identity_access: {
              principal_id: "user_123",
              granted_scopes: ["read:proofs", "write:proofs"],
              tenant_id: "tenant_a",
              token_valid: true,
              token_expired: false,
              access_log_present: true,
            },
          },
          RETRIEVAL_SOURCE_TYPE_KEY
        )
      )
    );

    expect(responses).toHaveLength(CONCURRENCY);
    let malformedCount = 0;
    for (const res of responses) {
      expect(res.statusCode).toBe(201);
      const body = res.json() as E2eBody;
      if (!body || !Array.isArray(body.proof_units) || !body.product_proof) {
        malformedCount += 1;
        continue;
      }
      const retrievalUnit = getProofUnit(body, "retrieval_integrity");
      expect(retrievalUnit).toBeDefined();
      expect(retrievalUnit?.status).toBe("conformant");
      expect(getProductAngle(body, "retrieval_integrity")?.status).toBe("pass");
    }
    expect(malformedCount).toBe(0);
  });
});
