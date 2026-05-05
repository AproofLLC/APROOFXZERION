/**
 * End-to-end: POST /events → proofability gate → canonical row → identity_access_integrity proof.
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

describe("e2e: identity_access_integrity angle", () => {
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
      sourceTypeKey: "e2e.identity_access_checked",
      canonicalEventType: "identity_access_checked",
      isActive: true,
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

  it("returns 201 with a conformant identity_access_integrity proof unit", async () => {
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
        source_type_key: "e2e.identity_access_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-identity-access-conformant",
        occurred_at: "2026-04-02T12:00:00.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-identity-access-record",
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
      canonical_event_type: string;
      subject_rail: string;
      proof_units: { proof_id: string; status: string; angle: string; delta_code: string | null }[];
      failure_locators_created: number;
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(body.ok).toBe(true);
    expect(body.canonical_event_type).toBe("identity_access_checked");
    expect(body.subject_rail).toBe("service");

    const identityUnit = body.proof_units.find((u) => u.angle === "identity_access_integrity");
    expect(identityUnit).toBeDefined();
    expect(identityUnit?.status).toBe("conformant");
    expect(identityUnit?.delta_code).toBeNull();
    expect(body.failure_locators_created).toBeGreaterThanOrEqual(0);

    expect(validateProductProof(body.product_proof)).toEqual([]);
    const identityAngle = body.product_proof.angles.find((a) => a.angle === "identity_access_integrity");
    expect(identityAngle?.status).toBe("pass");
  });

  it("returns 201 with a violated identity_access_integrity proof unit", async () => {
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
        source_type_key: "e2e.identity_access_checked",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-identity-access-violated",
        occurred_at: "2026-04-02T12:00:01.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-identity-access-record",
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
      failure_locators_created: number;
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(body.ok).toBe(true);

    const identityUnit = body.proof_units.find((u) => u.angle === "identity_access_integrity");
    expect(identityUnit).toBeDefined();
    expect(identityUnit?.status).toBe("violated");
    expect(identityUnit?.delta_code).toBe("IDENTITY_ACCESS_SCOPES_MISSING");
    expect(body.failure_locators_created).toBeGreaterThanOrEqual(1);

    expect(validateProductProof(body.product_proof)).toEqual([]);
    const identityAngle = body.product_proof.angles.find((a) => a.angle === "identity_access_integrity");
    expect(identityAngle?.status).toBe("fail");
  });
});
