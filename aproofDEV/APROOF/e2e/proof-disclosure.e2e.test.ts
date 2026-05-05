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

const e2eUrl = process.env.E2E_DATABASE_URL?.trim();

async function closeDb(db: Db) {
  if (db.$client instanceof Pool) {
    await db.$client.end();
  } else {
    await db.$client.close();
  }
}

describe("e2e: proof disclosure views", () => {
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
      sourceTypeKey: "e2e.proof_disclosure",
      canonicalEventType: "action_completed",
      isActive: true,
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

  function mismatchPayload() {
    return {
      organization_id: orgId,
      environment_id: envId,
      source_type_key: "e2e.proof_disclosure",
      subject_id: subjectId,
      event_lineage_id: randomUUID(),
      event_version: 1,
      trace_id: `e2e-trace-proof-disclosure-${randomUUID()}`,
      occurred_at: "2026-04-06T12:00:00.000Z",
      payload: {
        host: "e2e",
        record_id: "e2e-disclosure-record",
        deterministic: {
          observed_digest: "zzz999",
        },
        operational: {
          execution_status: "success",
          latency_ms: 100,
          runtime_error: null,
        },
      },
    };
  }

  it("internal view returns failure_intelligence insights with delta_code/cluster_key present", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "x-api-key": apiKeyPlain,
        "x-proof-view": "internal",
        "content-type": "application/json",
      },
      payload: mismatchPayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      failure_intelligence: {
        insights: Array<{
          angle: string;
          delta_code?: string | null;
          cluster_key?: string;
          category: string;
        }>;
      };
    };
    const insight = body.failure_intelligence.insights.find((i) => i.angle === "deterministic_integrity");
    expect(insight?.category).toBe("MISMATCH");
    expect(insight?.delta_code).toBe("DETERMINISTIC_DIGEST_MISMATCH");
    expect(insight?.cluster_key).toBe("deterministic_integrity:MISMATCH:DETERMINISTIC_DIGEST_MISMATCH");
  });

  it("external view keeps stable failure_intelligence insights (category, summary, delta_code, cluster_key)", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "x-api-key": apiKeyPlain,
        "x-proof-view": "external",
        "content-type": "application/json",
      },
      payload: mismatchPayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      failure_intelligence: {
        insights: Array<Record<string, unknown>>;
        primary_failure_category: string;
      };
    };
    const insight = body.failure_intelligence.insights.find(
      (i) => i.angle === "deterministic_integrity"
    ) as Record<string, unknown> | undefined;
    expect(body.failure_intelligence.primary_failure_category).toBe("MISMATCH");
    expect(insight?.category).toBe("MISMATCH");
    expect(typeof insight?.summary).toBe("string");
    expect(insight?.delta_code).toBe("DETERMINISTIC_DIGEST_MISMATCH");
    expect(typeof insight?.cluster_key).toBe("string");
  });

  it("minimal view removes failure_intelligence and proof_units, while keeping product_proof angle statuses", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "x-api-key": apiKeyPlain,
        "x-proof-view": "minimal",
        "content-type": "application/json",
      },
      payload: mismatchPayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      canonical_event_type: string;
      product_proof: {
        proof_status: string;
        angles: Array<{ angle: string; applicable: boolean; status: string }>;
      };
      failure_intelligence?: unknown;
      proof_units?: unknown;
    };
    expect(body.ok).toBe(true);
    expect(body.canonical_event_type).toBe("action_completed");
    expect(body.failure_intelligence).toBeUndefined();
    expect(body.proof_units).toBeUndefined();
    expect(body.product_proof.proof_status).toBe("failed");
    const deterministicAngle = body.product_proof.angles.find(
      (a) => a.angle === "deterministic_integrity"
    );
    expect(deterministicAngle?.status).toBe("fail");
  });

  it("adversarial_safe view removes proof_units, failure_intelligence, and detailed product metadata", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "x-api-key": apiKeyPlain,
        "x-proof-view": "adversarial_safe",
        "content-type": "application/json",
      },
      payload: mismatchPayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      canonical_event_type: string;
      message?: string;
      source_type_key?: unknown;
      subject_rail?: unknown;
      proof_units?: unknown;
      failure_intelligence?: unknown;
      product_proof: {
        proof_status: string;
        angles: Array<Record<string, unknown>>;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.canonical_event_type).toBe("action_completed");
    expect(body.message).toBe("Integrity verification completed.");
    expect(body.proof_units).toBeUndefined();
    expect(body.failure_intelligence).toBeUndefined();
    expect(body.source_type_key).toBeUndefined();
    expect(body.subject_rail).toBeUndefined();
    expect(body.product_proof.proof_status).toBeDefined();
    expect(Array.isArray(body.product_proof.angles)).toBe(true);
    for (const angle of body.product_proof.angles) {
      expect(Object.keys(angle).sort()).toEqual(["angle", "applicable", "status"]);
    }
  });
});
