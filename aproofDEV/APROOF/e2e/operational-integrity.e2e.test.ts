/**
 * End-to-end: POST /events → proofability gate → canonical row → operational_integrity proof.
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

describe("e2e: operational_integrity angle", () => {
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
      sourceTypeKey: "e2e.operational_checked",
      canonicalEventType: "action_completed",
      isActive: true,
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
      angle: "operational_integrity",
      version: 1,
      definition: {
        type: "operational_integrity_v1",
        expected_status: "success",
        max_latency_ms: 500,
        require_no_runtime_error: true,
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

  it("conformant case", async () => {
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
        source_type_key: "e2e.operational_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-operational-conformant",
        occurred_at: "2026-04-02T12:00:00.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-operational-record",
          policy: { tags: ["allow_read"] },
          operational: {
            execution_status: "success",
            latency_ms: 120,
            runtime_error: null,
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
    const operationalUnit = body.proof_units.find((u) => u.angle === "operational_integrity");
    expect(operationalUnit).toBeDefined();
    expect(operationalUnit?.status).toBe("conformant");
    expect(validateProductProof(body.product_proof)).toEqual([]);
    const operationalAngle = body.product_proof.angles.find((a) => a.angle === "operational_integrity");
    expect(operationalAngle?.status).toBe("pass");
  });

  it("failure: latency exceeded", async () => {
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
        source_type_key: "e2e.operational_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-operational-latency",
        occurred_at: "2026-04-02T12:00:01.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-operational-record",
          policy: { tags: ["allow_read"] },
          operational: {
            execution_status: "success",
            latency_ms: 999,
            runtime_error: null,
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
    const operationalUnit = body.proof_units.find((u) => u.angle === "operational_integrity");
    expect(operationalUnit?.status).toBe("violated");
    expect(operationalUnit?.delta_code).toBe("OPERATIONAL_LATENCY_EXCEEDED");
    expect(validateProductProof(body.product_proof)).toEqual([]);
    const operationalAngle = body.product_proof.angles.find((a) => a.angle === "operational_integrity");
    expect(operationalAngle?.status).toBe("fail");
  });

  it("failure: runtime error present", async () => {
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
        source_type_key: "e2e.operational_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-operational-runtime-error",
        occurred_at: "2026-04-02T12:00:02.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-operational-record",
          policy: { tags: ["allow_read"] },
          operational: {
            execution_status: "success",
            latency_ms: 100,
            runtime_error: "stacktrace",
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
    const operationalUnit = body.proof_units.find((u) => u.angle === "operational_integrity");
    expect(operationalUnit?.status).toBe("violated");
    expect(operationalUnit?.delta_code).toBe("OPERATIONAL_RUNTIME_ERROR_PRESENT");
    expect(validateProductProof(body.product_proof)).toEqual([]);
    const operationalAngle = body.product_proof.angles.find((a) => a.angle === "operational_integrity");
    expect(operationalAngle?.status).toBe("fail");
  });

  it("failure: status mismatch", async () => {
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
        source_type_key: "e2e.operational_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-operational-status",
        occurred_at: "2026-04-02T12:00:03.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-operational-record",
          policy: { tags: ["allow_read"] },
          operational: {
            execution_status: "failure",
            latency_ms: 100,
            runtime_error: null,
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
    const operationalUnit = body.proof_units.find((u) => u.angle === "operational_integrity");
    expect(operationalUnit?.status).toBe("violated");
    expect(operationalUnit?.delta_code).toBe("OPERATIONAL_STATUS_MISMATCH");
    expect(validateProductProof(body.product_proof)).toEqual([]);
    const operationalAngle = body.product_proof.angles.find((a) => a.angle === "operational_integrity");
    expect(operationalAngle?.status).toBe("fail");
  });
});
