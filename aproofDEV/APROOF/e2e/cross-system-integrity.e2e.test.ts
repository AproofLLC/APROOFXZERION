/**
 * End-to-end: POST /events → proofability gate → canonical row → cross_system_integrity proof.
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

describe("e2e: cross_system_integrity angle", () => {
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
      sourceTypeKey: "e2e.cross_system_checked",
      canonicalEventType: "action_completed",
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
        source_type_key: "e2e.cross_system_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-cross-system-conformant",
        occurred_at: "2026-04-02T12:00:00.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-cross-system-record",
          cross_system: {
            observed_systems: ["crm", "billing"],
          },
          operational: {
            execution_status: "success",
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
    const crossSystemUnit = body.proof_units.find((u) => u.angle === "cross_system_integrity");
    expect(crossSystemUnit).toBeDefined();
    expect(crossSystemUnit?.status).toBe("conformant");
    const crossSystemAngle = body.product_proof.angles.find((a) => a.angle === "cross_system_integrity");
    expect(crossSystemAngle?.status).toBe("pass");
    expect(validateProductProof(body.product_proof)).toEqual([]);
  });

  it("failure: missing observed systems", async () => {
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
        source_type_key: "e2e.cross_system_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-cross-system-missing",
        occurred_at: "2026-04-02T12:00:01.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-cross-system-record",
          cross_system: {
            observed_systems: [],
          },
          operational: {
            execution_status: "success",
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
    const crossSystemUnit = body.proof_units.find((u) => u.angle === "cross_system_integrity");
    expect(crossSystemUnit?.status).toBe("violated");
    expect(crossSystemUnit?.delta_code).toBe("CROSS_SYSTEM_SYSTEMS_MISSING");
    const crossSystemAngle = body.product_proof.angles.find((a) => a.angle === "cross_system_integrity");
    expect(crossSystemAngle?.status).toBe("fail");
  });

  it("failure: expected system missing", async () => {
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
        source_type_key: "e2e.cross_system_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-cross-system-expected-missing",
        occurred_at: "2026-04-02T12:00:02.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-cross-system-record",
          cross_system: {
            observed_systems: ["crm"],
          },
          operational: {
            execution_status: "success",
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
    const crossSystemUnit = body.proof_units.find((u) => u.angle === "cross_system_integrity");
    expect(crossSystemUnit?.status).toBe("violated");
    expect(crossSystemUnit?.delta_code).toBe("CROSS_SYSTEM_EXPECTED_SYSTEM_MISSING");
    const crossSystemAngle = body.product_proof.angles.find((a) => a.angle === "cross_system_integrity");
    expect(crossSystemAngle?.status).toBe("fail");
  });
});
