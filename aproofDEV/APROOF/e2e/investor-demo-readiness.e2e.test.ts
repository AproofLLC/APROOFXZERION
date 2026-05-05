import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Db } from "../src/db/client.js";
import { buildServer } from "../src/http/server.js";
import { ensureDemoTenant, DEMO } from "../src/scripts/seed-demo.js";
import { REAL_SUBJECT, hasCompleteBaselinesForRealSubject } from "../src/demo/real-subject-readiness.js";
import { cleanSystemControlPayload } from "../src/demo/demo-clean-payloads.js";
import type { ProductProof } from "../src/product/product-proof.js";

describe("e2e: investor demo readiness", () => {
  let db: Db;
  let app: FastifyInstance;

  beforeAll(async () => {
    const { openPgliteMemory } = await import("../src/db/pglite.js");
    const opened = await openPgliteMemory();
    db = opened.db;
    await ensureDemoTenant(db);
    app = buildServer(db);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if ("close" in db.$client) await (db.$client as { close: () => Promise<void> }).close();
    else await (db.$client as { end: () => Promise<void> }).end();
  });

  it("passes pre-demo proof checklist for one controlled real subject", async () => {
    expect(await hasCompleteBaselinesForRealSubject(db)).toBe(true);

    const clean = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal", "content-type": "application/json" },
      payload: {
        organization_id: REAL_SUBJECT.org_id,
        environment_id: REAL_SUBJECT.environment_id,
        source_type_key: "demo.real.action_completed",
        subject_id: REAL_SUBJECT.subject_id,
        event_lineage_id: "88888888-8888-4888-8888-888888888801",
        event_version: 1,
        trace_id: "investor-clean-v1",
        occurred_at: "2026-01-03T00:00:00.000Z",
        payload: cleanSystemControlPayload({
          host: "investor-demo",
          operational: { execution_status: "success", latency_ms: 110, runtime_error: null },
        }),
      },
    });
    expect(clean.statusCode).toBe(201);
    const c = clean.json() as { event_id: string; product_proof: ProductProof };
    expect(c.product_proof.proof_digest.startsWith("sha256:")).toBe(true);
    expect(c.product_proof.contract_valid).toBe(true);
    expect(c.product_proof.angles).toHaveLength(7);
    for (const a of c.product_proof.angles) {
      expect(a.baseline_status).not.toBe("missing");
      expect(a.reason_code).not.toBe("BASELINE_MISSING");
    }
    expect(c.product_proof.proof_status).toBe("verified");
    expect(c.product_proof.proof_sufficiency).toBe("full");
    const retrieval = c.product_proof.angles.find((x) => x.angle === "retrieval_integrity");
    expect(retrieval?.status).toBe("pass");

    const changed = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal", "content-type": "application/json" },
      payload: {
        organization_id: REAL_SUBJECT.org_id,
        environment_id: REAL_SUBJECT.environment_id,
        source_type_key: "demo.real.action_completed",
        subject_id: REAL_SUBJECT.subject_id,
        event_lineage_id: "88888888-8888-4888-8888-888888888801",
        event_version: 2,
        trace_id: "investor-clean-v2",
        occurred_at: "2026-01-03T00:01:00.000Z",
        payload: cleanSystemControlPayload({
          host: "investor-demo",
          operational: { execution_status: "success", latency_ms: 250, runtime_error: null },
        }),
      },
    });
    expect(changed.statusCode).toBe(201);

    const replay = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": DEMO.apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: REAL_SUBJECT.org_id,
        environment_id: REAL_SUBJECT.environment_id,
        source_type_key: "demo.real.action_completed",
        subject_id: REAL_SUBJECT.subject_id,
        event_lineage_id: "88888888-8888-4888-8888-888888888801",
        event_version: 2,
        trace_id: "investor-clean-v2",
        occurred_at: "2026-01-03T00:01:00.000Z",
        payload: {
          host: "investor-demo",
          record_id: "demo-system-record",
          policy: { tags: ["allow_read"] },
          identity_access: { scopes: ["read:proofs"], tenant_id: "tenant_demo", access_log_present: true },
          operational: { execution_status: "success", latency_ms: 110, runtime_error: null },
          model_identity: { observed_model: "gpt-4.1-mini" },
          deterministic: { observed_digest: "stable-demo-digest-v1" },
          cross_system: { observed_systems: ["ehr", "queue", "llm"] },
        },
      },
    });
    expect(replay.statusCode).toBe(422);

    const getProof = await app.inject({
      method: "GET",
      url: `/proofs/${c.product_proof.proof_id}`,
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(getProof.statusCode).toBe(200);
    const getAgain = await app.inject({
      method: "GET",
      url: `/proofs/${c.product_proof.proof_id}`,
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(getAgain.statusCode).toBe(200);
    const g1 = getProof.json() as { product_proof: ProductProof };
    const g2 = getAgain.json() as { product_proof: ProductProof };
    expect(g1.product_proof.proof_digest).toBe(g2.product_proof.proof_digest);
    expect(g1.product_proof.proof_status).toBe(g2.product_proof.proof_status);

    const getList = await app.inject({
      method: "GET",
      url: `/subjects/${REAL_SUBJECT.subject_id}/proofs?limit=10&offset=0`,
      headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal" },
    });
    expect(getList.statusCode).toBe(200);
  });
});
