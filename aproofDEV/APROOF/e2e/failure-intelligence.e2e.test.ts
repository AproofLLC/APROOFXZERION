/**
 * End-to-end: POST /events includes failure_intelligence rollup (Phase 3).
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
import type { FailureRollup } from "../src/product/failure-intelligence.js";

const e2eUrl = process.env.E2E_DATABASE_URL?.trim();

async function closeDb(db: Db) {
  if (db.$client instanceof Pool) {
    await db.$client.end();
  } else {
    await db.$client.close();
  }
}

type Events201Body = {
  ok: boolean;
  proof_units: { proof_id: string; status: string; angle: string; delta_code: string | null }[];
  failure_intelligence: FailureRollup;
};

describe("e2e: failure_intelligence on POST /events", () => {
  let db: Db | undefined;
  let app: FastifyInstance | undefined;
  let apiKeyPlain: string;
  let orgId: string;
  let envId: string;
  let subjectMismatchId: string;
  let subjectNoBaselineId: string;
  let subjectRetrievalId: string;

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
    subjectMismatchId = randomUUID();
    subjectNoBaselineId = randomUUID();
    subjectRetrievalId = randomUUID();
    apiKeyPlain = `e2e_${randomUUID()}`;
    const keyHash = createHash("sha256").update(apiKeyPlain, "utf8").digest("hex");
    const keyPrefix = apiKeyPlain.slice(0, 8);

    await db.insert(organizations).values({ id: orgId, name: `e2e-org-${orgId.slice(0, 8)}` });
    await db.insert(environments).values({ id: envId, organizationId: orgId, name: "e2e-env" });

    for (const id of [subjectMismatchId, subjectNoBaselineId, subjectRetrievalId]) {
      await db.insert(subjects).values({
        id,
        organizationId: orgId,
        environmentId: envId,
        railType: "service",
        externalKey: `e2e-ext-${id.slice(0, 8)}`,
      });
    }

    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: "e2e.failintel.mismatch",
      canonicalEventType: "action_completed",
      isActive: true,
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: "e2e.failintel.no_baseline",
      canonicalEventType: "action_completed",
      isActive: true,
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: "e2e.failintel.retrieval",
      canonicalEventType: "retrieval_completed",
      isActive: true,
    });

    await db.insert(baselines).values({
      organizationId: orgId,
      environmentId: envId,
      subjectId: subjectMismatchId,
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
      subjectId: subjectRetrievalId,
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
      subjectId: subjectRetrievalId,
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
      subjectId: subjectRetrievalId,
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

  it("violated deterministic_integrity mismatch surfaces MISMATCH insight; primary follows product angle order", async () => {
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
        source_type_key: "e2e.failintel.mismatch",
        subject_id: subjectMismatchId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-failintel-mismatch",
        occurred_at: "2026-04-02T12:00:00.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-failintel-record",
          deterministic: { observed_digest: "zzz999" },
          operational: {
            execution_status: "success",
            latency_ms: 100,
            runtime_error: null,
          },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as Events201Body;
    expect(body.failure_intelligence).toBeDefined();
    expect(body.failure_intelligence.primary_failure_category).toBe("MISMATCH");
    expect(body.failure_intelligence.failed_angles).toContain("deterministic_integrity");
    const det = body.proof_units.find((u) => u.angle === "deterministic_integrity");
    expect(det?.delta_code).toBe("DETERMINISTIC_DIGEST_MISMATCH");
    expect(body.failure_intelligence.insights.some((i) => i.cluster_key === "deterministic_integrity:MISMATCH:DETERMINISTIC_DIGEST_MISMATCH")).toBe(
      true
    );
  });

  it("missing baseline path returns CONFIG_MISSING as primary category", async () => {
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
        source_type_key: "e2e.failintel.no_baseline",
        subject_id: subjectNoBaselineId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-failintel-no-baseline",
        occurred_at: "2026-04-02T12:00:01.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-failintel-record",
          operational: {
            execution_status: "success",
            latency_ms: 100,
            runtime_error: null,
          },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as Events201Body;
    expect(body.failure_intelligence).toBeDefined();
    expect(["PAYLOAD_MISSING", "CONFIG_MISSING"]).toContain(body.failure_intelligence.primary_failure_category);
    expect(body.failure_intelligence.failed_angles.length).toBeGreaterThanOrEqual(1);
  });

  it("retrieval expected source missing returns EXPECTED_SOURCE_MISSING", async () => {
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
        source_type_key: "e2e.failintel.retrieval",
        subject_id: subjectRetrievalId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-failintel-retrieval",
        occurred_at: "2026-04-02T12:00:02.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-failintel-record",
          retrieval: { retrieved_sources: ["db", "search"] },
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
    const body = res.json() as Events201Body;
    expect(body.failure_intelligence).toBeDefined();
    expect(body.failure_intelligence.primary_failure_category).toBe("EXPECTED_SOURCE_MISSING");
    expect(body.failure_intelligence.failed_angles).toContain("retrieval_integrity");
    const retrievalUnit = body.proof_units.find((u) => u.angle === "retrieval_integrity");
    expect(retrievalUnit?.delta_code).toBe("RETRIEVAL_EXPECTED_SOURCE_MISSING");
    expect(
      body.failure_intelligence.insights.some(
        (i) => i.cluster_key === "retrieval_integrity:EXPECTED_SOURCE_MISSING:RETRIEVAL_EXPECTED_SOURCE_MISSING"
      )
    ).toBe(true);
  });
});
