import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/http/server.js";
import { ensureDemoTenant, DEMO } from "../src/scripts/seed-demo.js";
import type { Db } from "../src/db/client.js";
import { mappingRules, subjects } from "../src/db/schema/index.js";
import type { ProductProof } from "../src/product/product-proof.js";

const SUBJECT_TYPES = ["model", "agent", "service", "system", "endpoint"] as const;

describe("e2e: subject readiness", () => {
  let db: Db;
  let app: FastifyInstance;
  const subjectIds: Record<(typeof SUBJECT_TYPES)[number], string> = {
    model: randomUUID(),
    agent: randomUUID(),
    service: randomUUID(),
    system: randomUUID(),
    endpoint: randomUUID(),
  };

  beforeAll(async () => {
    const { openPgliteMemory } = await import("../src/db/pglite.js");
    const opened = await openPgliteMemory();
    db = opened.db;
    await ensureDemoTenant(db);
    for (const type of SUBJECT_TYPES) {
      await db.insert(subjects).values({
        id: subjectIds[type],
        organizationId: DEMO.orgId,
        environmentId: DEMO.envId,
        railType: type,
        externalKey: `subject-readiness-${type}`,
      });
      await db.insert(mappingRules).values({
        organizationId: DEMO.orgId,
        environmentId: DEMO.envId,
        sourceTypeKey: `demo.readiness.${type}`,
        canonicalEventType: "policy_checked",
        isActive: true,
      }).onConflictDoNothing({
        target: [mappingRules.organizationId, mappingRules.environmentId, mappingRules.sourceTypeKey],
      });
    }
    app = buildServer(db);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if ("close" in db.$client) await (db.$client as { close: () => Promise<void> }).close();
    else await (db.$client as { end: () => Promise<void> }).end();
  });

  it("handles one valid event per subject type with complete baseline metadata output", async () => {
    for (const type of SUBJECT_TYPES) {
      const res = await app.inject({
        method: "POST",
        url: "/events",
        headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal", "content-type": "application/json" },
        payload: {
          organization_id: DEMO.orgId,
          environment_id: DEMO.envId,
          source_type_key: `demo.readiness.${type}`,
          subject_id: subjectIds[type],
          event_lineage_id: randomUUID(),
          event_version: 1,
          trace_id: `readiness-${type}-valid`,
          occurred_at: "2026-02-01T00:00:00.000Z",
          payload: { policy: { tags: ["allow_read"] }, host: "readiness", record_id: "e2e-readiness-record" },
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { product_proof: ProductProof };
      expect(body.product_proof.angles).toHaveLength(7);
      for (const angle of body.product_proof.angles) {
        expect(typeof angle.baseline_present).toBe("boolean");
        expect(angle.baseline_source).toBeDefined();
        expect(angle.baseline_status).toBeDefined();
        expect(angle.baseline_rule_id).toBeTruthy();
        expect(angle.baseline_version).toBeTruthy();
        expect(typeof angle.delta_detected).toBe("boolean");
        expect(angle.delta_type).toBeTruthy();
      }
    }
  });

  it("handles partial payload deterministically (no throw, no blank angle outputs)", async () => {
    for (const type of SUBJECT_TYPES) {
      const res = await app.inject({
        method: "POST",
        url: "/events",
        headers: { "x-api-key": DEMO.apiKeyPlain, "x-proof-view": "internal", "content-type": "application/json" },
        payload: {
          organization_id: DEMO.orgId,
          environment_id: DEMO.envId,
          source_type_key: `demo.readiness.${type}`,
          subject_id: subjectIds[type],
          event_lineage_id: randomUUID(),
          event_version: 1,
          trace_id: `readiness-${type}-partial`,
          occurred_at: "2026-02-01T00:01:00.000Z",
          payload: {},
        },
      });
      expect([201, 422]).toContain(res.statusCode);
      if (res.statusCode === 201) {
        const body = res.json() as { product_proof: ProductProof };
        expect(body.product_proof.angles).toHaveLength(7);
        for (const angle of body.product_proof.angles) {
          expect(angle.reason_code).toBeTruthy();
          expect(angle.evidence_refs).toBeDefined();
          expect(angle.baseline_present).toBe(false);
          expect(typeof angle.delta_detected).toBe("boolean");
          expect(angle.delta_type).toBeTruthy();
        }
      }
    }
  });
});
