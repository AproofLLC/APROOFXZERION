/**
 * End-to-end: POST /events → proofability gate → canonical row → multi-angle proof behavior.
 * Default: in-memory PGlite (no env). Optional: E2E_DATABASE_URL for real Postgres.
 * This file is the accumulation harness for multi-angle proof behavior. Every new angle added to the system should eventually be represented here.
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

describe("e2e: multi-angle proof behavior", () => {
  let db: Db | undefined;
  let app: FastifyInstance | undefined;
  let apiKeyPlain: string;
  let orgId: string;
  let envId: string;
  let subjectId: string;

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
      sourceTypeKey: "e2e.multi_angle_checked",
      canonicalEventType: "action_completed",
      isActive: true,
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: "e2e.multi_angle_retrieval_checked",
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

  it("returns 201 with conformant policy_integrity and identity_access_integrity proof units", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "x-api-key": apiKeyPlain,
        "content-type": "application/json",
      },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.multi_angle_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-multi-angle-conformant",
        occurred_at: "2026-04-02T12:00:00.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-multi-angle-record",
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
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      source_type_key?: string;
      canonical_event_type: string;
      subject_rail: string;
      proof_units: { proof_id: string; status: string; angle: string; delta_code: string | null }[];
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(body.ok).toBe(true);
    if (body.source_type_key !== undefined) {
      expect(body.source_type_key).toBe("e2e.multi_angle_checked");
    }
    expect(body.canonical_event_type).toBe("action_completed");
    expect(body.subject_rail).toBe("service");
    expect(Array.isArray(body.proof_units)).toBe(true);

    const policyUnit = body.proof_units.find((u) => u.angle === "policy_integrity");
    const identityUnit = body.proof_units.find((u) => u.angle === "identity_access_integrity");
    const operationalUnit = body.proof_units.find((u) => u.angle === "operational_integrity");
    const modelIdentityUnit = body.proof_units.find((u) => u.angle === "model_identity_integrity");
    const deterministicUnit = body.proof_units.find((u) => u.angle === "deterministic_integrity");
    const crossSystemUnit = body.proof_units.find((u) => u.angle === "cross_system_integrity");
    expect(policyUnit).toBeDefined();
    expect(identityUnit).toBeDefined();
    expect(operationalUnit).toBeDefined();
    expect(modelIdentityUnit).toBeDefined();
    expect(deterministicUnit).toBeDefined();
    expect(crossSystemUnit).toBeDefined();
    expect(policyUnit?.status).toBe("conformant");
    expect(identityUnit?.status).toBe("conformant");
    expect(operationalUnit?.status).toBe("conformant");
    expect(modelIdentityUnit?.status).toBe("conformant");
    expect(deterministicUnit?.status).toBe("conformant");
    expect(crossSystemUnit?.status).toBe("conformant");

    expect(validateProductProof(body.product_proof)).toEqual([]);
    const policyAngle = body.product_proof.angles.find((a) => a.angle === "policy_integrity");
    const identityAngle = body.product_proof.angles.find((a) => a.angle === "identity_access_integrity");
    const operationalAngle = body.product_proof.angles.find((a) => a.angle === "operational_integrity");
    const modelIdentityAngle = body.product_proof.angles.find((a) => a.angle === "model_identity_integrity");
    const deterministicAngle = body.product_proof.angles.find((a) => a.angle === "deterministic_integrity");
    const crossSystemAngle = body.product_proof.angles.find((a) => a.angle === "cross_system_integrity");
    expect(policyAngle?.status).toBe("pass");
    expect(identityAngle?.status).toBe("pass");
    expect(operationalAngle?.status).toBe("pass");
    expect(modelIdentityAngle?.status).toBe("pass");
    expect(deterministicAngle?.status).toBe("pass");
    expect(crossSystemAngle?.status).toBe("pass");
  });

  it("returns 201 with conformant policy_integrity and violated identity_access_integrity proof units", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "x-api-key": apiKeyPlain,
        "content-type": "application/json",
      },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.multi_angle_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-multi-angle-mixed",
        occurred_at: "2026-04-02T12:00:01.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-multi-angle-record",
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
            granted_scopes: ["write:proofs"],
            tenant_id: "tenant_a",
            token_valid: true,
            token_expired: false,
            access_log_present: true,
          },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      proof_units: { proof_id: string; status: string; angle: string; delta_code: string | null }[];
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.proof_units)).toBe(true);

    const policyUnit = body.proof_units.find((u) => u.angle === "policy_integrity");
    const identityUnit = body.proof_units.find((u) => u.angle === "identity_access_integrity");
    const operationalUnit = body.proof_units.find((u) => u.angle === "operational_integrity");
    const modelIdentityUnit = body.proof_units.find((u) => u.angle === "model_identity_integrity");
    const deterministicUnit = body.proof_units.find((u) => u.angle === "deterministic_integrity");
    const crossSystemUnit = body.proof_units.find((u) => u.angle === "cross_system_integrity");
    expect(policyUnit).toBeDefined();
    expect(identityUnit).toBeDefined();
    expect(operationalUnit).toBeDefined();
    expect(modelIdentityUnit).toBeDefined();
    expect(deterministicUnit).toBeDefined();
    expect(crossSystemUnit).toBeDefined();
    expect(policyUnit?.status).toBe("conformant");
    expect(identityUnit?.status).toBe("violated");
    expect(operationalUnit?.status).toBe("conformant");
    expect(modelIdentityUnit?.status).toBe("conformant");
    expect(deterministicUnit?.status).toBe("conformant");
    expect(crossSystemUnit?.status).toBe("conformant");
    expect(identityUnit?.delta_code).toBe("IDENTITY_ACCESS_SCOPES_MISSING");

    const policyAngle = body.product_proof.angles.find((a) => a.angle === "policy_integrity");
    const identityAngle = body.product_proof.angles.find((a) => a.angle === "identity_access_integrity");
    const operationalAngle = body.product_proof.angles.find((a) => a.angle === "operational_integrity");
    const modelIdentityAngle = body.product_proof.angles.find((a) => a.angle === "model_identity_integrity");
    const deterministicAngle = body.product_proof.angles.find((a) => a.angle === "deterministic_integrity");
    const crossSystemAngle = body.product_proof.angles.find((a) => a.angle === "cross_system_integrity");
    expect(policyAngle?.status).toBe("pass");
    expect(identityAngle?.status).toBe("fail");
    expect(operationalAngle?.status).toBe("pass");
    expect(modelIdentityAngle?.status).toBe("pass");
    expect(deterministicAngle?.status).toBe("pass");
    expect(crossSystemAngle?.status).toBe("pass");
  });

  it("returns 201 with conformant retrieval_integrity proof unit on retrieval_completed", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "x-api-key": apiKeyPlain,
        "content-type": "application/json",
      },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.multi_angle_retrieval_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-multi-angle-retrieval",
        occurred_at: "2026-04-02T12:00:02.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-multi-angle-record",
          retrieval: {
            retrieved_sources: ["db", "cache"],
          },
          policy: { tags: ["allow_read"] },
          identity_access: {
            principal_id: "user_123",
            granted_scopes: ["read:proofs", "write:proofs"],
            tenant_id: "tenant_a",
            token_valid: true,
            token_expired: false,
            access_log_present: true,
          },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      proof_units: { proof_id: string; status: string; angle: string; delta_code: string | null }[];
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(body.ok).toBe(true);
    const retrievalUnit = body.proof_units.find((u) => u.angle === "retrieval_integrity");
    expect(retrievalUnit).toBeDefined();
    expect(retrievalUnit?.status).toBe("conformant");
    const retrievalAngle = body.product_proof.angles.find((a) => a.angle === "retrieval_integrity");
    expect(retrievalAngle?.status).toBe("pass");
  });
});
