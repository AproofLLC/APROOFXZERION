/**
 * Digest determinism: POST proof_digest must equal two GET /proofs/{proof_id} reconstructions.
 * GET /proofs/:id accepts canonical event_id or any proof unit proof_id.
 */
import { createHash, randomUUID } from "node:crypto";
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { and, eq } from "drizzle-orm";
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
import type { ProductProof } from "../src/product/product-proof.js";
import { assertProofDigestParity, toHashableProofPayload } from "../src/product/proof-digest.js";
import { stableStringify } from "../src/protocol/event-hashing.js";
import { DEMO, ensureDemoTenant } from "../src/scripts/seed-demo.js";

const e2eUrl = process.env.E2E_DATABASE_URL?.trim();

async function closeDb(db: Db) {
  if (db.$client instanceof Pool) {
    await db.$client.end();
  } else {
    await db.$client.close();
  }
}

function asProof(x: unknown): ProductProof {
  return x as ProductProof;
}

describe("e2e: digest stability & proof lookup", () => {
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
      railType: "system",
      externalKey: `digest-e2e-${subjectId.slice(0, 8)}`,
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: "e2e.policy_checked",
      canonicalEventType: "policy_checked",
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

  it("POST proof_digest matches two GETs by proof_id and by event_id", async () => {
    const occurredAt = "2026-04-07T15:00:00.000Z";
    const body = {
      organization_id: orgId,
      environment_id: envId,
      source_type_key: "e2e.policy_checked",
      subject_id: subjectId,
      event_lineage_id: randomUUID(),
      event_version: 1,
      trace_id: "digest-e2e-trace",
      occurred_at: occurredAt,
      payload: {
        host: "digest-e2e",
        record_id: "e2e-digest-record",
        digest: "stable",
        policy: { tags: ["allow_read"] },
        systems: ["ehr", "queue", "llm"],
      },
    };

    const postRes = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKeyPlain,
        "x-proof-view": "internal",
      },
      payload: body,
    });
    expect(postRes.statusCode).toBe(201);
    const created = postRes.json() as { product_proof: ProductProof; event_id: string };
    const writeDigest = created.product_proof.proof_digest;
    const proofId = created.product_proof.proof_id;
    const eventId = created.event_id;

    const get1 = await app!.inject({
      method: "GET",
      url: `/proofs/${proofId}`,
      headers: { "x-api-key": apiKeyPlain, "x-proof-view": "internal" },
    });
    const get2 = await app!.inject({
      method: "GET",
      url: `/proofs/${proofId}`,
      headers: { "x-api-key": apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(get1.statusCode).toBe(200);
    expect(get2.statusCode).toBe(200);
    const r1 = get1.json() as { product_proof: ProductProof };
    const r2 = get2.json() as { product_proof: ProductProof };

    const byEvent = await app!.inject({
      method: "GET",
      url: `/proofs/${eventId}`,
      headers: { "x-api-key": apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(byEvent.statusCode).toBe(200);
    const rEv = byEvent.json() as { product_proof: ProductProof };

    expect(r1.product_proof.proof_digest).toBe(writeDigest);
    expect(r2.product_proof.proof_digest).toBe(writeDigest);
    expect(rEv.product_proof.proof_digest).toBe(writeDigest);
    expect(r1.product_proof.angles.map((a) => a.angle)).toEqual(
      created.product_proof.angles.map((a) => a.angle)
    );
    expect(r1.product_proof.failure_locator).toEqual(created.product_proof.failure_locator);
    expect({
      event_id: r1.product_proof.event_id,
      event_lineage_id: r1.product_proof.event_lineage_id,
      event_version: r1.product_proof.event_version,
      lineage_status: r1.product_proof.lineage_status,
      lineage_reason: r1.product_proof.lineage_reason,
      canonical_hash: r1.product_proof.canonical_hash,
      artifact_hash: r1.product_proof.artifact_hash,
      occurrence_hash: r1.product_proof.occurrence_hash,
    }).toEqual({
      event_id: created.product_proof.event_id,
      event_lineage_id: created.product_proof.event_lineage_id,
      event_version: created.product_proof.event_version,
      lineage_status: created.product_proof.lineage_status,
      lineage_reason: created.product_proof.lineage_reason,
      canonical_hash: created.product_proof.canonical_hash,
      artifact_hash: created.product_proof.artifact_hash,
      occurrence_hash: created.product_proof.occurrence_hash,
    });

    const parity = assertProofDigestParity(
      writeDigest,
      [r1.product_proof.proof_digest, r2.product_proof.proof_digest],
      {
        write: created.product_proof,
        reads: [r1.product_proof, r2.product_proof],
      }
    );
    expect(parity.ok).toBe(true);

    const hw = stableStringify(toHashableProofPayload(created.product_proof));
    const hr = stableStringify(toHashableProofPayload(r1.product_proof));
    expect(hr).toBe(hw);
  });

  it("hashable payload round-trips through protocol stableStringify", () => {
    const minimal = asProof({
      proof_id: "p1",
      org_id: orgId,
      subject_id: subjectId,
      subject_type: "system",
      raw_event_id: "r1",
      canonical_event_id: "e1",
      event_type: "policy_checked",
      event_timestamp: "2026-04-07T15:00:00.000Z",
      received_at: "2026-04-07T15:00:01.000Z",
      proofability_status: "proofable",
      proof_status: "verified",
      proof_summary: "ok",
      angles: [
        {
          angle: "policy_integrity",
          applicable: true,
          status: "pass",
          reason_code: "OK",
          summary: "ok",
          evidence_refs: ["p1"],
          sources_state: "present",
        },
        {
          angle: "identity_access_integrity",
          applicable: true,
          status: "pass",
          reason_code: "OK",
          summary: "ok",
          evidence_refs: ["p2"],
          sources_state: "present",
        },
        {
          angle: "operational_integrity",
          applicable: false,
          status: "not_applicable",
          reason_code: "NO_SOURCES",
          summary: "na",
          evidence_refs: [],
          sources_state: "no sources",
        },
        {
          angle: "model_identity_integrity",
          applicable: false,
          status: "not_applicable",
          reason_code: "NO_SOURCES",
          summary: "na",
          evidence_refs: [],
          sources_state: "no sources",
        },
        {
          angle: "retrieval_integrity",
          applicable: false,
          status: "not_applicable",
          reason_code: "NO_SOURCES",
          summary: "na",
          evidence_refs: [],
          sources_state: "no sources",
        },
        {
          angle: "deterministic_integrity",
          applicable: false,
          status: "not_applicable",
          reason_code: "NO_SOURCES",
          summary: "na",
          evidence_refs: [],
          sources_state: "no sources",
        },
        {
          angle: "cross_system_integrity",
          applicable: false,
          status: "not_applicable",
          reason_code: "NO_SOURCES",
          summary: "na",
          evidence_refs: [],
          sources_state: "no sources",
        },
      ],
      contract_valid: true,
      contract_failure_reason: null,
      flags: [],
      flags_count: 0,
      canonicalization_version: "0.1.0",
      verifier_version: "0.1.0",
      proof_digest: "",
      anchor_status: "pending",
      created_at: "2026-04-07T15:00:01.000Z",
      updated_at: "2026-04-07T15:00:01.000Z",
      event_id: "e1",
      event_lineage_id: "l1",
      event_version: 1,
      lineage_status: "new_lineage",
      lineage_reason: "t",
      matched_prior_event_id: null,
      canonical_hash: "h1",
      artifact_hash: "a1",
      occurrence_hash: "o1",
    });
    const payload = toHashableProofPayload(minimal);
    const once = stableStringify(payload);
    expect(stableStringify(JSON.parse(once) as typeof payload)).toBe(once);
  });
});

describe("e2e: read/write contention (no 500, stable list)", () => {
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
    apiKeyPlain = `e2e_rw_${randomUUID()}`;
    const keyHash = createHash("sha256").update(apiKeyPlain, "utf8").digest("hex");
    const keyPrefix = apiKeyPlain.slice(0, 8);

    await db.insert(organizations).values({ id: orgId, name: `e2e-rw-${orgId.slice(0, 8)}` });
    await db.insert(environments).values({ id: envId, organizationId: orgId, name: "e2e-env" });
    await db.insert(subjects).values({
      id: subjectId,
      organizationId: orgId,
      environmentId: envId,
      railType: "system",
      externalKey: `rw-${subjectId.slice(0, 8)}`,
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: "e2e.policy_checked",
      canonicalEventType: "policy_checked",
      isActive: true,
    });
    await db.insert(baselines).values({
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "policy_integrity",
      version: 1,
      definition: { type: "policy_integrity_v1", required_tags: ["allow_read"] },
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

  it("concurrent POSTs and GET /subjects/:id/proofs return 2xx only", async () => {
    const n = 12;
    const posts = Array.from({ length: n }, (_, i) =>
      app!.inject({
        method: "POST",
        url: "/events",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKeyPlain,
          "x-proof-view": "internal",
        },
        payload: {
          organization_id: orgId,
          environment_id: envId,
          source_type_key: "e2e.policy_checked",
          subject_id: subjectId,
          event_lineage_id: randomUUID(),
          event_version: 1,
          trace_id: `rw-${i}-${randomUUID()}`,
          occurred_at: new Date(Date.UTC(2026, 3, 7, 12, 0, i)).toISOString(),
          payload: {
            host: "rw",
            record_id: "e2e-rw-record",
            digest: `d-${i}`,
            policy: { tags: ["allow_read"] },
            systems: ["ehr", "queue", "llm"],
          },
        },
      })
    );
    const reads = Array.from({ length: n }, () =>
      app!.inject({
        method: "GET",
        url: `/subjects/${subjectId}/proofs?limit=20&offset=0`,
        headers: { "x-api-key": apiKeyPlain, "x-proof-view": "internal" },
      })
    );

    const all = await Promise.all([...posts, ...reads]);
    for (const res of all) {
      expect([200, 201]).toContain(res.statusCode);
    }

    const listJson = all[all.length - 1]!.json() as { items: unknown[] };
    expect(Array.isArray(listJson.items)).toBe(true);
  });
});

/**
 * Mirrors live harness: `register-test-subject` (ensureDemoTenant + subject row) then POST /events
 * with demo org/env and demo.policy_checked. Ingest resolves subject by (id, organizationId, environmentId).
 */
describe("e2e: demo tenant register-style subject then POST /events", () => {
  let db: Db | undefined;
  let app: FastifyInstance | undefined;
  let registeredSubjectId: string;
  let wrongEnvId: string;
  let wrongEnvApiKeyPlain: string;
  let insertedSubjectRow:
    | {
        id: string;
        organizationId: string;
        environmentId: string;
        railType: "system";
        externalKey: string;
      }
    | undefined;

  beforeAll(async () => {
    if (e2eUrl) {
      db = createDb(e2eUrl);
    } else {
      const { openPgliteMemory } = await import("../src/db/pglite.js");
      const opened = await openPgliteMemory();
      db = opened.db;
    }

    await ensureDemoTenant(db);
    registeredSubjectId = randomUUID();
    insertedSubjectRow = {
      id: registeredSubjectId,
      organizationId: DEMO.orgId,
      environmentId: DEMO.envId,
      railType: "system",
      externalKey: `register-test-parity-${registeredSubjectId.slice(0, 8)}`,
    };
    await db.insert(subjects).values(insertedSubjectRow);
    wrongEnvId = randomUUID();
    wrongEnvApiKeyPlain = `e2e_wrong_env_${randomUUID()}`;
    const wrongEnvKeyHash = createHash("sha256").update(wrongEnvApiKeyPlain, "utf8").digest("hex");
    const wrongEnvKeyPrefix = wrongEnvApiKeyPlain.slice(0, 8);
    await db.insert(environments).values({
      id: wrongEnvId,
      organizationId: DEMO.orgId,
      name: "demo-wrong-env",
    });
    await db.insert(mappingRules).values({
      organizationId: DEMO.orgId,
      environmentId: wrongEnvId,
      sourceTypeKey: "demo.policy_checked",
      canonicalEventType: "policy_checked",
      isActive: true,
    });
    await db.insert(apiKeys).values({
      organizationId: DEMO.orgId,
      environmentId: wrongEnvId,
      name: "demo-wrong-env",
      keyPrefix: wrongEnvKeyPrefix,
      keyHash: wrongEnvKeyHash,
    });

    app = buildServer(db);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    if (db) await closeDb(db);
  });

  it("POST /events resolves register-style subject with exact ingest lookup contract", async () => {
    const body: Record<string, unknown> = {
      organization_id: DEMO.orgId,
      environment_id: DEMO.envId,
      source_type_key: "demo.policy_checked",
      subject_id: registeredSubjectId,
      event_lineage_id: randomUUID(),
      event_version: 1,
      trace_id: "register-then-post-e2e",
      occurred_at: "2026-04-07T16:00:00.000Z",
      payload: {
        host: "register-parity",
        record_id: "e2e-register-record",
        digest: "parity",
        policy: { tags: ["allow_read"] },
        systems: ["ehr", "queue", "llm"],
      },
    };

    const resolvedRows = await db!
      .select()
      .from(subjects)
      .where(
        and(
          eq(subjects.id, registeredSubjectId),
          eq(subjects.organizationId, DEMO.orgId),
          eq(subjects.environmentId, DEMO.envId)
        )
      );
    const subjectResolutionCount = resolvedRows.length;

    const postRes = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "content-type": "application/json",
        "x-api-key": DEMO.apiKeyPlain,
        "x-proof-view": "internal",
      },
      payload: body,
    });
    if (postRes.statusCode !== 201) {
      const maybeError = postRes.json() as { reason?: string };
      throw new Error(
        JSON.stringify(
          {
            message: "Expected 201 for register-style subject resolution.",
            inserted_subject_row: insertedSubjectRow,
            post_body: body,
            subject_resolution_count: subjectResolutionCount,
            failure_reason: maybeError.reason ?? "(missing reason)",
            status_code: postRes.statusCode,
            raw_response: postRes.body,
          },
          null,
          2
        )
      );
    }
    const created = postRes.json() as { product_proof: { proof_id: string } };
    expect(created.product_proof.proof_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("POST /events with same subject_id but wrong environment_id returns 422 subject_not_unique_or_missing", async () => {
    const body = {
      organization_id: DEMO.orgId,
      environment_id: wrongEnvId,
      source_type_key: "demo.policy_checked",
      subject_id: registeredSubjectId,
      event_lineage_id: randomUUID(),
      event_version: 1,
      trace_id: "register-then-post-e2e-wrong-env",
      occurred_at: "2026-04-07T16:01:00.000Z",
      payload: {
        host: "register-parity",
        record_id: "e2e-register-record",
        digest: "parity-wrong-env",
        policy: { tags: ["allow_read"] },
        systems: ["ehr", "queue", "llm"],
      },
    };

    const resolvedRows = await db!
      .select()
      .from(subjects)
      .where(
        and(
          eq(subjects.id, registeredSubjectId),
          eq(subjects.organizationId, DEMO.orgId),
          eq(subjects.environmentId, wrongEnvId)
        )
      );
    const subjectResolutionCount = resolvedRows.length;

    const postRes = await app!.inject({
      method: "POST",
      url: "/events",
      headers: {
        "content-type": "application/json",
        "x-api-key": wrongEnvApiKeyPlain,
        "x-proof-view": "internal",
      },
      payload: body,
    });

    expect(postRes.statusCode).toBe(422);
    const payload = postRes.json() as {
      error: { code: string; details?: { reason: string } };
    };
    expect(payload.error.code).toBe("NOT_PROOFABLE");
    expect(payload.error.details?.reason).toBe("subject_not_unique_or_missing");
    expect(subjectResolutionCount).toBe(0);
  });
});
