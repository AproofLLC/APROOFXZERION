import { createHash, randomUUID } from "node:crypto";
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
import { validateProductProof } from "../src/product/product-proof.js";
import type { FastifyInstance } from "fastify";

const e2eUrl = process.env.E2E_DATABASE_URL?.trim();

async function closeDb(db: Db) {
  if (db.$client instanceof Pool) {
    await db.$client.end();
  } else {
    await db.$client.close();
  }
}

describe("e2e: API freeze contract", () => {
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

    await db.insert(organizations).values({ id: orgId, name: `e2e-api-freeze-${orgId.slice(0, 8)}` });
    await db.insert(environments).values({ id: envId, organizationId: orgId, name: "e2e-env" });
    await db.insert(subjects).values({
      id: subjectId,
      organizationId: orgId,
      environmentId: envId,
      railType: "service",
      externalKey: `e2e-freeze-${subjectId.slice(0, 8)}`,
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: "e2e.api_freeze",
      canonicalEventType: "action_completed",
      isActive: true,
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: "e2e.policy_missing_baseline",
      canonicalEventType: "policy_checked",
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

  it("POST /events 201 includes frozen identity block (internal view)", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "x-api-key": apiKeyPlain,
        "x-proof-view": "internal",
        "content-type": "application/json",
      },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.api_freeze",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: `e2e-freeze-post-${randomUUID()}`,
        occurred_at: "2026-04-06T14:00:00.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-api-freeze-record",
          deterministic: { observed_digest: "abc123" },
          operational: {
            execution_status: "success",
            latency_ms: 10,
            runtime_error: null,
          },
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      event_id: string;
      identity: {
        event_id: string;
        artifact_id: string;
        event_lineage_id: string;
        event_version: number;
        canonical_hash: string;
        logical_hash: string;
      };
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(body.identity.event_id).toBe(body.event_id);
    expect(body.identity.artifact_id).toMatch(UUID_RE);
    expect(body.identity.event_lineage_id).toMatch(UUID_RE);
    expect(body.identity.event_version).toBe(1);
    expect(body.identity.canonical_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.identity.logical_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(validateProductProof(body.product_proof)).toEqual([]);
    expect(body.product_proof.angles).toHaveLength(7);
    expect(body.product_proof.event_id).toBe(body.event_id);
    expect(body.product_proof.event_lineage_id).toBe(body.identity.event_lineage_id);
    expect(body.product_proof.event_version).toBe(body.identity.event_version);
    expect(body.product_proof.canonical_hash).toBe(body.identity.canonical_hash);
    expect(["new_lineage", "existing_lineage_same_state", "existing_lineage_new_version"]).toContain(
      body.product_proof.lineage_status
    );
    expect(typeof body.product_proof.lineage_reason).toBe("string");
    expect(body.product_proof.lineage_reason.length).toBeGreaterThan(0);
  });

  it("GET /proofs/:id returns same contract as ingest (200) and 404 when missing", async () => {
    const post = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "x-api-key": apiKeyPlain,
        "content-type": "application/json",
      },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.api_freeze",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: `e2e-freeze-get-proof-${randomUUID()}`,
        occurred_at: "2026-04-06T14:01:00.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-api-freeze-record",
          deterministic: { observed_digest: "abc123" },
          operational: {
            execution_status: "success",
            latency_ms: 10,
            runtime_error: null,
          },
        },
      },
    });
    expect(post.statusCode).toBe(201);
    const eventId = (post.json() as { event_id: string }).event_id;

    const missing = await app!.inject({
      method: "GET",
      url: `/proofs/${randomUUID()}`,
      headers: { "x-api-key": apiKeyPlain },
    });
    expect(missing.statusCode).toBe(404);
    const missBody = missing.json() as { ok: false; error: { code: string } };
    expect(missBody.ok).toBe(false);
    expect(missBody.error.code).toBe("NOT_FOUND");

    const badId = await app!.inject({
      method: "GET",
      url: "/proofs/not-a-uuid",
      headers: { "x-api-key": apiKeyPlain },
    });
    expect(badId.statusCode).toBe(400);
    const badBody = badId.json() as { ok: false; error: { code: string } };
    expect(badBody.ok).toBe(false);
    expect(badBody.error.code).toBe("INVALID_ID");

    const got = await app!.inject({
      method: "GET",
      url: `/proofs/${eventId}`,
      headers: { "x-api-key": apiKeyPlain },
    });
    expect(got.statusCode).toBe(200);
    const g = got.json() as {
      event_id: string;
      identity: { event_id: string };
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(g.event_id).toBe(eventId);
    expect(g.identity.event_id).toBe(eventId);
    expect(validateProductProof(g.product_proof)).toEqual([]);
    expect(g.product_proof.angles).toHaveLength(7);
    expect(g.product_proof.event_id).toBe(eventId);
    expect(g.product_proof.event_lineage_id).toBe(g.identity.event_lineage_id);
    expect(g.product_proof.event_version).toBe(g.identity.event_version);
    expect(g.product_proof.canonical_hash).toBe(g.identity.canonical_hash);
    expect(typeof g.product_proof.lineage_reason).toBe("string");
  });

  it("GET /subjects/:id/proofs returns paginated proof envelopes", async () => {
    const list = await app!.inject({
      method: "GET",
      url: `/subjects/${subjectId}/proofs?limit=10&offset=0`,
      headers: { "x-api-key": apiKeyPlain },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as {
      items: unknown[];
      page: { limit: number; offset: number; total: number };
    };
    expect(body.page.limit).toBe(10);
    expect(body.page.offset).toBe(0);
    expect(body.page.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    const first = body.items[0] as {
      product_proof: import("../src/product/product-proof.js").ProductProof;
      identity: { event_lineage_id: string; event_version: number; canonical_hash: string };
    };
    expect(validateProductProof(first.product_proof)).toEqual([]);
    expect(first.product_proof.angles).toHaveLength(7);
    expect(first.product_proof.event_lineage_id).toBe(first.identity.event_lineage_id);
    expect(first.product_proof.event_version).toBe(first.identity.event_version);
    expect(first.product_proof.canonical_hash).toBe(first.identity.canonical_hash);
    const summary = first as { proof_list_summary?: { proof_id: string; failed_angles: string[] } };
    expect(summary.proof_list_summary?.proof_id).toBe(first.product_proof.proof_id);
    expect(Array.isArray(summary.proof_list_summary?.failed_angles)).toBe(true);
  });

  it("GET /failures lists failure locators after a deterministic violation", async () => {
    await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.api_freeze",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: `e2e-freeze-fail-${randomUUID()}`,
        occurred_at: "2026-04-06T14:02:00.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-api-freeze-record",
          deterministic: { observed_digest: "bad-digest-violation" },
          operational: {
            execution_status: "success",
            latency_ms: 10,
            runtime_error: null,
          },
        },
      },
    });

    const res = await app!.inject({
      method: "GET",
      url: `/failures?subject_id=${subjectId}&limit=20`,
      headers: { "x-api-key": apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ angle: string; inspection_path: string; event_id: string }>;
      page: { total: number };
    };
    expect(body.page.total).toBeGreaterThanOrEqual(1);
    expect(body.items.some((i) => i.angle === "deterministic_integrity")).toBe(true);
    expect(body.items[0]?.inspection_path).toBeDefined();
  });

  it("422 NOT_PROOFABLE returns stable error envelope with reason and raw_event_id in details", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.unknown_mapping",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "t",
        occurred_at: "2026-04-06T14:03:00.000Z",
        payload: { host: "e2e", record_id: "e2e-api-freeze-record" },
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as {
      ok: false;
      error: { code: string; message: string; details?: { reason: string; raw_event_id: string } };
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_PROOFABLE");
    expect(body.error.details?.reason).toBe("mapping_missing");
    expect(body.error.details?.raw_event_id).toMatch(UUID_RE);
  });

  it("POST/GET/list expose stable failure_locator for baseline missing policy_checked", async () => {
    const create = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "x-proof-view": "internal", "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.policy_missing_baseline",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: `e2e-failure-locator-${randomUUID()}`,
        occurred_at: "2026-04-06T14:04:00.000Z",
        payload: {
          host: "e2e",
          record_id: "e2e-api-freeze-record",
          policy: { tags: ["allow_read"] },
          systems: ["ehr", "queue", "llm"],
        },
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as {
      event_id: string;
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(created.product_proof.contract_valid).toBe(true);
    expect(created.product_proof.angles).toHaveLength(7);
    expect(["verified", "failed"]).toContain(created.product_proof.proof_status);
    if (created.product_proof.proof_status === "failed") {
      expect(created.product_proof.failure_locator).toBeTruthy();
    } else {
      expect(created.product_proof.failure_locator).toBeNull();
    }

    const byProof = await app!.inject({
      method: "GET",
      url: `/proofs/${created.product_proof.proof_id}`,
      headers: { "x-api-key": apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(byProof.statusCode).toBe(200);
    const readOne = byProof.json() as {
      product_proof: import("../src/product/product-proof.js").ProductProof;
    };
    expect(readOne.product_proof.failure_locator).toEqual(created.product_proof.failure_locator);

    const list = await app!.inject({
      method: "GET",
      url: `/subjects/${subjectId}/proofs?limit=20&offset=0`,
      headers: { "x-api-key": apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as {
      items: Array<{ event_id: string; product_proof: import("../src/product/product-proof.js").ProductProof }>;
    };
    const matched = listBody.items.find((i) => i.event_id === created.event_id);
    expect(matched).toBeDefined();
    expect(matched?.product_proof.failure_locator).toEqual(created.product_proof.failure_locator);
  });
});
