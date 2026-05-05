import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createDb, type Db } from "../src/db/client.js";
import { buildServer } from "../src/http/server.js";
import { ensureDemoTenant, DEMO } from "../src/scripts/seed-demo.js";
import {
  REAL_SUBJECT,
  REAL_SUBJECT_ANGLE_ORDER,
  assertBaselineContractCompleteness,
  REAL_SUBJECT_BASELINE_CONTRACT,
} from "../src/demo/real-subject-readiness.js";
import { cleanSystemControlPayload } from "../src/demo/demo-clean-payloads.js";
import type { ProductProof } from "../src/product/product-proof.js";
import { assertProofDigestParity } from "../src/product/proof-digest.js";
import { eq } from "drizzle-orm";
import { proofUnits } from "../src/db/schema/index.js";

describe("e2e: real subject readiness", () => {
  let db: Db;
  let app: FastifyInstance;

  beforeAll(async () => {
    const { openPgliteMemory } = await import("../src/db/pglite.js");
    const opened = await openPgliteMemory();
    db = opened.db;
    await ensureDemoTenant(db);
    assertBaselineContractCompleteness(REAL_SUBJECT_BASELINE_CONTRACT, REAL_SUBJECT.subject_type);
    app = buildServer(db);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if ("close" in db.$client) await (db.$client as { close: () => Promise<void> }).close();
    else await (db.$client as { end: () => Promise<void> }).end();
  });

  function actionCompletedPayload(opts?: {
    digest?: string;
    crossSystems?: string[];
    trace?: string;
    at?: string;
  }) {
    return {
      organization_id: REAL_SUBJECT.org_id,
      environment_id: REAL_SUBJECT.environment_id,
      source_type_key: "demo.real.action_completed",
      subject_id: REAL_SUBJECT.subject_id,
      event_lineage_id: "77777777-7777-4777-8777-777777777701",
      event_version: 1,
      trace_id: opts?.trace ?? "real-subject-clean-trace",
      occurred_at: opts?.at ?? "2026-01-02T00:00:00.000Z",
      payload: cleanSystemControlPayload({
        host: "investor-demo",
        deterministic: { observed_digest: opts?.digest ?? "stable-demo-digest-v1", temperature: 0 },
        cross_system: { observed_systems: opts?.crossSystems ?? ["ehr", "queue", "llm"] },
      }),
    };
  }

  it("subject with complete baselines returns 201 with valid seven-angle proof envelope", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal", "content-type": "application/json" },
      payload: actionCompletedPayload(),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { product_proof: ProductProof };
    expect(body.product_proof.contract_valid).toBe(true);
    expect(body.product_proof.angles).toHaveLength(7);
    expect(body.product_proof.angles.map((a) => a.angle)).toEqual([...REAL_SUBJECT_ANGLE_ORDER]);
    for (const a of body.product_proof.angles) {
      expect(a.baseline_status).not.toBe("missing");
      expect(a.reason_code).not.toBe("BASELINE_MISSING");
    }
    expect(body.product_proof.proof_status).toBe("verified");
    // action_completed has no retrieval data — retrieval_integrity evaluates as pass (non-applicable valid).
    expect(body.product_proof.proof_sufficiency).toBe("full");
    const retrieval = body.product_proof.angles.find((x) => x.angle === "retrieval_integrity");
    expect(retrieval?.status).toBe("pass");
  });

  it("write/read parity keeps digest, lineage, failure_locator, and angle order stable", async () => {
    const post = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal", "content-type": "application/json" },
      payload: {
        ...actionCompletedPayload({ trace: "real-subject-parity-trace" }),
        event_lineage_id: randomUUID(),
      },
    });
    expect(post.statusCode).toBe(201);
    const created = post.json() as { event_id: string; product_proof: ProductProof };

    const get = await app.inject({
      method: "GET",
      url: `/proofs/${created.product_proof.proof_id}`,
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(get.statusCode).toBe(200);
    const read = get.json() as { product_proof: ProductProof };
    expect(read.product_proof.event_lineage_id).toBe(created.product_proof.event_lineage_id);
    expect(read.product_proof.event_version).toBe(created.product_proof.event_version);
    expect(read.product_proof.failure_locator).toEqual(created.product_proof.failure_locator);
    expect(read.product_proof.angles.map((a) => a.angle)).toEqual(created.product_proof.angles.map((a) => a.angle));
    const parity = assertProofDigestParity(created.product_proof.proof_digest, [read.product_proof.proof_digest], {
      write: created.product_proof,
      reads: [read.product_proof],
    });
    expect(parity.ok).toBe(true);
  });

  it("duplicate same-state replay is rejected cleanly with stable reason", async () => {
    const lineage = randomUUID();
    const req = {
      ...actionCompletedPayload({ trace: "real-subject-replay-trace" }),
      event_lineage_id: lineage,
      event_version: 1,
    };
    const first = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": DEMO.apiKeyPlain, "content-type": "application/json" },
      payload: req,
    });
    expect(first.statusCode).toBe(201);
    const replay = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": DEMO.apiKeyPlain, "content-type": "application/json" },
      payload: req,
    });
    expect(replay.statusCode).toBe(422);
    const err = replay.json() as {
      error: { code: string; details?: { reason: string } };
    };
    expect(err.error.code).toBe("NOT_PROOFABLE");
    expect(err.error.details?.reason).toBe("duplicate_lineage_version_same_hash");
  });

  it("changed-state event advances lineage version and status", async () => {
    const lineage = randomUUID();
    const v1 = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal", "content-type": "application/json" },
      payload: {
        ...actionCompletedPayload({ trace: "real-subject-version-v1", at: "2026-01-02T00:10:00.000Z" }),
        event_lineage_id: lineage,
        event_version: 1,
      },
    });
    expect(v1.statusCode).toBe(201);
    const v2 = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal", "content-type": "application/json" },
      payload: {
        ...actionCompletedPayload({
          trace: "real-subject-version-v2",
          at: "2026-01-02T00:11:00.000Z",
          digest: "stable-demo-digest-v2",
        }),
        event_lineage_id: lineage,
        event_version: 2,
      },
    });
    expect(v2.statusCode).toBe(201);
    const p2 = v2.json() as { product_proof: ProductProof };
    expect(p2.product_proof.event_lineage_id).toBe(lineage);
    expect(p2.product_proof.event_version).toBe(2);
    expect(p2.product_proof.lineage_status).toBe("existing_lineage_new_version");
  });

  it("baseline-missing path remains deterministic and stable on GET", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal", "content-type": "application/json" },
      payload: {
        organization_id: REAL_SUBJECT.org_id,
        environment_id: REAL_SUBJECT.environment_id,
        source_type_key: "demo.real.policy_checked",
        subject_id: REAL_SUBJECT.subject_id,
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "real-subject-baseline-missing-trace",
        occurred_at: "2024-01-01T00:00:00.000Z",
        payload: {
          host: "investor-demo",
          record_id: "demo-system-record",
          policy: { tags: ["allow_read"] },
          identity_access: { scopes: ["read:proofs"], tenant_id: "tenant_demo", access_log_present: true },
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json() as { product_proof: ProductProof };
    expect(created.product_proof.contract_valid).toBe(true);
    expect(created.product_proof.angles).toHaveLength(7);
    const read = await app.inject({
      method: "GET",
      url: `/proofs/${created.product_proof.proof_id}`,
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(read.statusCode).toBe(200);
    const body = read.json() as { product_proof: ProductProof };
    expect(body.product_proof.failure_locator).toEqual(created.product_proof.failure_locator);
  });

  it("subject list remains stable and keeps failure_locator on non-clean proofs", async () => {
    const list = await app.inject({
      method: "GET",
      url: `/subjects/${REAL_SUBJECT.subject_id}/proofs?limit=20&offset=0`,
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { items: Array<{ product_proof: ProductProof }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    for (const item of body.items) {
      if (item.product_proof.proof_status !== "verified") {
        expect(item.product_proof.failure_locator).toBeTruthy();
      }
    }
  });

  it("persists proof-time baseline snapshot and diff metadata across write/read", async () => {
    const post = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal", "content-type": "application/json" },
      payload: {
        ...actionCompletedPayload({ trace: "persisted-baseline-snapshot" }),
        event_lineage_id: randomUUID(),
      },
    });
    expect(post.statusCode).toBe(201);
    const created = post.json() as { product_proof: ProductProof };
    const deterministic = created.product_proof.angles.find((a) => a.angle === "deterministic_integrity");
    expect(deterministic?.baseline_rule_id).toBeTruthy();
    expect(typeof deterministic?.delta_detected).toBe("boolean");

    const row = await db
      .select({ evidenceJson: proofUnits.evidenceJson })
      .from(proofUnits)
      .where(eq(proofUnits.proofId, created.product_proof.proof_id))
      .limit(1);
    const evidence = row[0]?.evidenceJson as Record<string, unknown>;
    expect(evidence).toBeTruthy();
    expect(evidence.baseline_snapshot).toBeTruthy();
    expect(evidence.diff).toBeTruthy();

    const get = await app.inject({
      method: "GET",
      url: `/proofs/${created.product_proof.proof_id}`,
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(get.statusCode).toBe(200);
    const read = get.json() as { product_proof: ProductProof };
    const readDet = read.product_proof.angles.find((a) => a.angle === "deterministic_integrity");
    expect(readDet?.baseline_rule_id).toBe(deterministic?.baseline_rule_id);
    expect(readDet?.baseline_version).toBe(deterministic?.baseline_version);
    expect(readDet?.delta_type).toBe(deterministic?.delta_type);
  });
});
