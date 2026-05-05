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
  canonicalEvents,
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

function notProofableReasonFromResponse(res: { json(): unknown }): string | undefined {
  const b = res.json() as { error?: { details?: { reason?: string } } };
  return b.error?.details?.reason;
}

describe("e2e: pre-api hardening rules", () => {
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
      sourceTypeKey: "e2e.alias",
      canonicalEventType: "access_token_used",
      isActive: true,
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: "e2e.idempotency",
      canonicalEventType: "action_completed",
      isActive: true,
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: "e2e.strict_xray",
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

  it("normalizes access_token_used alias before routing/storage/output", async () => {
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
        source_type_key: "e2e.alias",
        subject_id: subjectId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-alias",
        occurred_at: "2026-04-06T12:00:00.000Z",
        payload: {
          host: "e2e",
          policy: { tags: ["allow_read"] },
          identity_access: { principal_id: "user_1", granted_scopes: ["read:proofs"] },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { canonical_event_type: string; event_id: string };
    expect(body.canonical_event_type).toBe("identity_access_checked");

    const rows = await db!
      .select({ eventType: canonicalEvents.eventType, eventVersion: canonicalEvents.eventVersion })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.eventId, body.event_id))
      .limit(1);
    expect(rows[0]?.eventType).toBe("identity_access_checked");
    expect(rows[0]?.eventVersion).toBe(1);
  });

  it("rejects duplicate event_id with same hash", async () => {
    const eventId = randomUUID();
    const lineageId = randomUUID();
    const payload = {
      organization_id: orgId,
      environment_id: envId,
      source_type_key: "e2e.idempotency",
      subject_id: subjectId,
      event_id: eventId,
      event_lineage_id: lineageId,
      event_version: 1,
      trace_id: "e2e-trace-idempotent-1",
      occurred_at: "2026-04-06T12:10:00.000Z",
      payload: {
        host: "e2e",
        deterministic: { observed_digest: "abc123" },
        operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
      },
    };
    const first = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload,
    });
    expect(second.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(second)).toBe("duplicate_event_id_same_hash");
  });

  it("rejects duplicate lineage+version with hash conflict", async () => {
    const lineageId = randomUUID();
    const first = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 1,
        trace_id: "e2e-trace-lineage-conflict-1",
        occurred_at: "2026-04-06T12:20:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(first.statusCode).toBe(201);

    const second = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 1,
        trace_id: "e2e-trace-lineage-conflict-2",
        occurred_at: "2026-04-06T12:20:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(second.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(second)).toBe("duplicate_lineage_version_same_hash");
  });

  it("rejects same lineage+version for different artifact_id with LINEAGE_ARTIFACT_IDENTITY_CONFLICT", async () => {
    const lineageId = randomUUID();
    const first = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 1,
        trace_id: "e2e-trace-artifact-lineage-a",
        occurred_at: "2026-04-06T12:20:30.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(first.statusCode).toBe(201);

    const second = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 1,
        trace_id: "e2e-trace-artifact-lineage-b",
        occurred_at: "2026-04-06T12:20:30.000Z",
        payload: {
          host: "e2e-other-payload",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(second.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(second)).toBe("LINEAGE_ARTIFACT_IDENTITY_CONFLICT");
  });

  it("rejects duplicate event_id with hash conflict", async () => {
    const eventId = randomUUID();
    const first = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: eventId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-event-id-conflict-1",
        occurred_at: "2026-04-06T12:21:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(first.statusCode).toBe(201);

    const second = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: eventId,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-event-id-conflict-2",
        occurred_at: "2026-04-06T12:21:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "zzz999" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(second.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(second)).toBe("duplicate_event_id_hash_conflict");
  });

  it("same content + different event_id yields duplicate_lineage_version_same_hash", async () => {
    const lineageId = randomUUID();
    const sharedPayload = {
      organization_id: orgId,
      environment_id: envId,
      source_type_key: "e2e.idempotency",
      subject_id: subjectId,
      event_lineage_id: lineageId,
      event_version: 2,
      trace_id: "e2e-trace-lineage-same-hash",
      occurred_at: "2026-04-06T12:22:00.000Z",
      payload: {
        host: "e2e",
        deterministic: { observed_digest: "abc123" },
        operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
      },
    };
    const first = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: { ...sharedPayload, event_id: randomUUID() },
    });
    expect(first.statusCode).toBe(201);

    const second = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: { ...sharedPayload, event_id: randomUUID() },
    });
    expect(second.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(second)).toBe("duplicate_lineage_version_same_hash");
  });

  it("retry without event_id resolves as duplicate_lineage_version_same_hash", async () => {
    const lineageId = randomUUID();
    const payload = {
      organization_id: orgId,
      environment_id: envId,
      source_type_key: "e2e.idempotency",
      subject_id: subjectId,
      event_lineage_id: lineageId,
      event_version: 1,
      trace_id: "e2e-trace-no-event-id-retry",
      occurred_at: "2026-04-06T12:23:00.000Z",
      payload: {
        host: "e2e",
        deterministic: { observed_digest: "abc123" },
        operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
      },
    };
    const first = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload,
    });
    expect(second.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(second)).toBe("duplicate_lineage_version_same_hash");
  });

  it("concurrent duplicate submissions return one success and one deterministic duplicate reason", async () => {
    const eventId = randomUUID();
    const payload = {
      organization_id: orgId,
      environment_id: envId,
      source_type_key: "e2e.idempotency",
      subject_id: subjectId,
      event_id: eventId,
      event_lineage_id: randomUUID(),
      event_version: 1,
      trace_id: "e2e-trace-concurrent-duplicate",
      occurred_at: "2026-04-06T12:24:00.000Z",
      payload: {
        host: "e2e",
        deterministic: { observed_digest: "abc123" },
        operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
      },
    };

    const [a, b] = await Promise.all([
      app!.inject({
        method: "POST",
        url: "/events",
        headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
        payload,
      }),
      app!.inject({
        method: "POST",
        url: "/events",
        headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
        payload,
      }),
    ]);
    const statuses = [a.statusCode, b.statusCode].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 422]);
    const failed = a.statusCode === 422 ? a : b;
    expect(notProofableReasonFromResponse(failed)).toBe("duplicate_event_id_same_hash");
  });

  it("rejects out-of-order lineage replay (3 then 2)", async () => {
    const lineageId = randomUUID();
    const v3 = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 3,
        trace_id: "e2e-trace-lineage-3",
        occurred_at: "2026-04-06T12:30:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(v3.statusCode).toBe(201);
    const v3Body = v3.json() as { lineage_anomaly: string | null };
    expect(v3Body.lineage_anomaly).toBeNull();

    const v2 = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 2,
        trace_id: "e2e-trace-lineage-2",
        occurred_at: "2026-04-06T12:29:59.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(v2.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(v2)).toBe("LINEAGE_VERSION_REPLAY_REJECTED");
  });

  it("rejects out-of-order lineage replay (2 after 4)", async () => {
    const lineageId = randomUUID();
    const v4 = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 4,
        trace_id: "e2e-trace-lineage-4",
        occurred_at: "2026-04-06T12:40:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(v4.statusCode).toBe(201);

    const v2 = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 2,
        trace_id: "e2e-trace-lineage-2-after-4",
        occurred_at: "2026-04-06T12:39:59.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(v2.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(v2)).toBe("LINEAGE_VERSION_REPLAY_REJECTED");
  });

  it("rejects lineage version gaps (v1 then v3)", async () => {
    const lineageId = randomUUID();
    const v1 = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 1,
        trace_id: "e2e-trace-gap-v1",
        occurred_at: "2026-04-06T12:41:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(v1.statusCode).toBe(201);
    const v3 = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 3,
        trace_id: "e2e-trace-gap-v3",
        occurred_at: "2026-04-06T12:41:05.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(v3.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(v3)).toBe("LINEAGE_VERSION_REPLAY_REJECTED");
  });

  it("accepts first-seen version greater than 1 without anomaly", async () => {
    const v7 = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: randomUUID(),
        event_version: 7,
        trace_id: "e2e-trace-first-seen-gt1",
        occurred_at: "2026-04-06T12:42:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(v7.statusCode).toBe(201);
    const body = v7.json() as { lineage_anomaly: string | null };
    expect(body.lineage_anomaly).toBeNull();
  });

  it("duplicate version arrival is rejected with exact duplicate reason", async () => {
    const lineageId = randomUUID();
    const first = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 5,
        trace_id: "e2e-trace-dup-version-1",
        occurred_at: "2026-04-06T12:43:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(first.statusCode).toBe(201);
    const duplicate = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 5,
        trace_id: "e2e-trace-dup-version-2",
        occurred_at: "2026-04-06T12:43:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(duplicate.statusCode).toBe(422);
    const dupJson = duplicate.json() as { lineage_anomaly?: string | null };
    expect(notProofableReasonFromResponse(duplicate)).toBe("duplicate_lineage_version_same_hash");
    expect(dupJson.lineage_anomaly).toBeUndefined();
  });

  it("lineage evolution with unchanged state at next version is rejected", async () => {
    const lineageId = randomUUID();
    const xray = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 1,
        trace_id: "e2e-trace-xray-v1",
        occurred_at: "2026-04-06T12:44:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(xray.statusCode).toBe(201);
    expect((xray.json() as { lineage_anomaly: string | null }).lineage_anomaly).toBeNull();

    const patch = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 2,
        trace_id: "e2e-trace-patch-v2",
        occurred_at: "2026-04-06T12:44:02.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(patch.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(patch)).toBe("LINEAGE_VERSION_REPLAY_REJECTED");
  });

  it("concurrent lineage replay returns one success and one duplicate_lineage_version_same_hash", async () => {
    const lineageId = randomUUID();
    const base = {
      organization_id: orgId,
      environment_id: envId,
      source_type_key: "e2e.idempotency",
      subject_id: subjectId,
      event_lineage_id: lineageId,
      event_version: 9,
      trace_id: "e2e-trace-concurrent-lineage-replay",
      occurred_at: "2026-04-06T12:45:00.000Z",
      payload: {
        host: "e2e",
        deterministic: { observed_digest: "abc123" },
        operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
      },
    };
    const [a, b] = await Promise.all([
      app!.inject({
        method: "POST",
        url: "/events",
        headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
        payload: { ...base, event_id: randomUUID() },
      }),
      app!.inject({
        method: "POST",
        url: "/events",
        headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
        payload: { ...base, event_id: randomUUID() },
      }),
    ]);
    const statuses = [a.statusCode, b.statusCode].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 422]);
    const failed = a.statusCode === 422 ? a : b;
    expect(notProofableReasonFromResponse(failed)).toBe("duplicate_lineage_version_same_hash");
  });

  it("concurrent lineage conflict returns one success and one duplicate_lineage_version_hash_conflict", async () => {
    const lineageId = randomUUID();
    const common = {
      organization_id: orgId,
      environment_id: envId,
      source_type_key: "e2e.idempotency",
      subject_id: subjectId,
      event_lineage_id: lineageId,
      event_version: 10,
      occurred_at: "2026-04-06T12:46:00.000Z",
    };
    const [a, b] = await Promise.all([
      app!.inject({
        method: "POST",
        url: "/events",
        headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
        payload: {
          ...common,
          event_id: randomUUID(),
          trace_id: "e2e-trace-concurrent-lineage-conflict-a",
          payload: {
            host: "e2e",
            deterministic: { observed_digest: "abc123" },
            operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
          },
        },
      }),
      app!.inject({
        method: "POST",
        url: "/events",
        headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
        payload: {
          ...common,
          event_id: randomUUID(),
          trace_id: "e2e-trace-concurrent-lineage-conflict-b",
          payload: {
            host: "e2e",
            deterministic: { observed_digest: "abc123" },
            operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
          },
        },
      }),
    ]);
    const statuses = [a.statusCode, b.statusCode].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 422]);
    const failed = a.statusCode === 422 ? a : b;
    expect(notProofableReasonFromResponse(failed)).toBe("duplicate_lineage_version_same_hash");
  });

  it("allows same trace_id across different events", async () => {
    const trace = "e2e-shared-trace";
    const lineageA = randomUUID();
    const lineageB = randomUUID();
    const first = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageA,
        event_version: 1,
        trace_id: trace,
        occurred_at: "2026-04-06T12:50:00.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    const second = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.idempotency",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageB,
        event_version: 1,
        trace_id: trace,
        occurred_at: "2026-04-06T12:50:01.000Z",
        payload: {
          host: "e2e",
          deterministic: { observed_digest: "abc123" },
          operational: { execution_status: "success", latency_ms: 100, runtime_error: null },
        },
      },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);

    const rows = await db!
      .select({ eventId: canonicalEvents.eventId })
      .from(canonicalEvents)
      .where(and(eq(canonicalEvents.traceId, trace), eq(canonicalEvents.organizationId, orgId)));
    expect(rows.length).toBe(2);
  });

  it("strict derivation: omitted artifact_id derives from stable xray_id and stays stable across updates", async () => {
    const lineageId = randomUUID();
    const first = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 1,
        trace_id: "e2e-trace-strict-xray-1",
        occurred_at: "2026-04-06T13:00:00.000Z",
        payload: {
          xray_id: "XRAY-1",
          analysis: "initial",
        },
      },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json() as { event_id: string };

    const second = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: lineageId,
        event_version: 2,
        trace_id: "e2e-trace-strict-xray-2",
        occurred_at: "2026-04-06T13:01:00.000Z",
        payload: {
          xray_id: "XRAY-1",
          analysis: "re-analyzed",
        },
      },
    });
    expect(second.statusCode).toBe(201);
    const secondBody = second.json() as { event_id: string };
    expect(firstBody.event_id).not.toBe(secondBody.event_id);

    const identities = await db!
      .select({ eventId: canonicalEvents.eventId, artifactId: canonicalEvents.artifactId })
      .from(canonicalEvents)
      .where(
        and(
          eq(canonicalEvents.organizationId, orgId),
          eq(canonicalEvents.environmentId, envId),
          eq(canonicalEvents.eventLineageId, lineageId)
        )
      );
    const firstIdentity = identities.find((r) => r.eventId === firstBody.event_id);
    const secondIdentity = identities.find((r) => r.eventId === secondBody.event_id);
    expect(firstIdentity?.artifactId).toBeDefined();
    expect(firstIdentity?.artifactId).toBe(secondIdentity?.artifactId);
  });

  it("strict derivation: different objects do not collapse into the same artifact_id", async () => {
    const first = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-strict-xray-obj-a",
        occurred_at: "2026-04-06T13:02:00.000Z",
        payload: {
          xray_id: "XRAY-A",
          analysis: "one",
        },
      },
    });
    expect(first.statusCode).toBe(201);
    const firstEventId = (first.json() as { event_id: string }).event_id;

    const second = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-strict-xray-obj-b",
        occurred_at: "2026-04-06T13:03:00.000Z",
        payload: {
          xray_id: "XRAY-B",
          analysis: "one",
        },
      },
    });
    expect(second.statusCode).toBe(201);
    const secondEventId = (second.json() as { event_id: string }).event_id;

    const [firstRow] = await db!
      .select({ eventId: canonicalEvents.eventId, artifactId: canonicalEvents.artifactId })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.eventId, firstEventId))
      .limit(1);
    const [secondRow] = await db!
      .select({ eventId: canonicalEvents.eventId, artifactId: canonicalEvents.artifactId })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.eventId, secondEventId))
      .limit(1);
    expect(firstRow?.artifactId).toBeDefined();
    expect(secondRow?.artifactId).toBeDefined();
    expect(firstRow?.artifactId).not.toBe(secondRow?.artifactId);
  });

  it("strict derivation: provided artifact_id conflicting with derived identity is rejected deterministically", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        event_id: randomUUID(),
        artifact_id: randomUUID(),
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-strict-xray-conflict",
        occurred_at: "2026-04-06T13:04:00.000Z",
        payload: {
          xray_id: "XRAY-CONFLICT",
          analysis: "one",
        },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(res)).toBe("ARTIFACT_ID_CONFLICT_WITH_DERIVED");
  });

  it("strict derivation: missing stable identity fields fails safely when artifact_id omitted", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        event_id: randomUUID(),
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "e2e-trace-strict-xray-not-derivable",
        occurred_at: "2026-04-06T13:05:00.000Z",
        payload: {
          analysis: "missing_xray_id",
        },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(notProofableReasonFromResponse(res)).toBe("ARTIFACT_ID_NOT_DERIVABLE");
  });
});
