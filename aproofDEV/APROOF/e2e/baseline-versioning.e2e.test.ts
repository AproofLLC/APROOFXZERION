/**
 * End-to-end: POST /events baseline version switching for model_identity_integrity.
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

describe("e2e: baseline versioning", () => {
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
      sourceTypeKey: "e2e.baseline_versioning",
      canonicalEventType: "action_completed",
      isActive: true,
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
        version: 1,
        effective_from: "2024-01-01T00:00:00.000Z",
      },
      effectiveFrom: new Date("2024-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2025-01-01T00:00:00.000Z"),
    });

    await db.insert(baselines).values({
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "model_identity_integrity",
      version: 2,
      definition: {
        type: "model_identity_integrity_v1",
        expected_model: "gpt-4.2",
        require_exact_match: true,
        version: 2,
        effective_from: "2025-01-01T00:00:00.000Z",
      },
      effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
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

  it("uses baseline version 1 before the switch date", async () => {
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
        source_type_key: "e2e.baseline_versioning",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-baseline-v1",
        occurred_at: "2024-06-15T12:00:00.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-baseline-record",
          operational: {
            execution_status: "success",
            latency_ms: 100,
            runtime_error: null,
          },
          model_identity: {
            observed_model: "gpt-4.1-mini",
          },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      canonical_event_type: string;
      proof_units: { proof_id: string; status: string; angle: string; delta_code: string | null }[];
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };

    expect(body.ok).toBe(true);
    expect(body.canonical_event_type).toBe("action_completed");
    const modelIdentityUnit = body.proof_units.find((u) => u.angle === "model_identity_integrity");
    expect(modelIdentityUnit).toBeDefined();
    expect(modelIdentityUnit?.status).toBe("conformant");
    const modelIdentityAngle = body.product_proof.angles.find((a) => a.angle === "model_identity_integrity");
    expect(modelIdentityAngle?.status).toBe("pass");
    expect(validateProductProof(body.product_proof)).toEqual([]);
  });

  it("uses baseline version 2 after the switch date", async () => {
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
        source_type_key: "e2e.baseline_versioning",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-baseline-v2",
        occurred_at: "2025-06-15T12:00:00.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-baseline-record",
          operational: {
            execution_status: "success",
            latency_ms: 100,
            runtime_error: null,
          },
          model_identity: {
            observed_model: "gpt-4.1-mini",
          },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      canonical_event_type: string;
      proof_units: { proof_id: string; status: string; angle: string; delta_code: string | null }[];
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };

    expect(body.ok).toBe(true);
    expect(body.canonical_event_type).toBe("action_completed");
    const modelIdentityUnit = body.proof_units.find((u) => u.angle === "model_identity_integrity");
    expect(modelIdentityUnit).toBeDefined();
    expect(modelIdentityUnit?.status).toBe("violated");
    expect(modelIdentityUnit?.delta_code).toBe("MODEL_IDENTITY_MISMATCH");
    const modelIdentityAngle = body.product_proof.angles.find((a) => a.angle === "model_identity_integrity");
    expect(modelIdentityAngle?.status).toBe("fail");
    expect(validateProductProof(body.product_proof)).toEqual([]);
  });
});
