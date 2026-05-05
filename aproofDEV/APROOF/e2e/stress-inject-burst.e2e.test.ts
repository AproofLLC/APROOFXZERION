/**
 * In-process burst against the real Fastify app + PGlite memory (no mocks).
 * Complements `npm run stress:api` (which needs a live HTTP server).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Db } from "../src/db/client.js";
import { buildServer } from "../src/http/server.js";
import { signUp } from "../src/http/auth-session.js";

describe("e2e: stress inject burst (in-process)", () => {
  let db: Db;
  let app: FastifyInstance;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    const { openPgliteMemory } = await import("../src/db/pglite.js");
    const opened = await openPgliteMemory();
    db = opened.db;
    app = buildServer(db);

    const email = `stress-inject-${randomUUID().slice(0, 8)}@aproof.test`;
    const su = await signUp(db, {
      email,
      password: "stress123456",
      organization_name: `stress-${randomUUID().slice(0, 8)}`,
    });
    if (!su.ok) throw new Error(su.message);
    cookie = `aproof_session=${su.session_token}`;

    const cr = await app.inject({
      method: "POST",
      url: "/subjects",
      headers: { cookie },
      payload: { subject_type: "service" },
    });
    expect(cr.statusCode).toBe(201);
    const body = JSON.parse(cr.payload) as { subject_id: string };
    subjectId = body.subject_id;
  });

  afterAll(async () => {
    await app.close();
    if (db.$client && "close" in db.$client && typeof db.$client.close === "function") {
      await (db.$client as { close: () => Promise<void> }).close();
    }
  });

  it("parallel read burst returns 200 with no 5xx", async () => {
    const paths = [
      () => app.inject({ method: "GET", url: "/auth/session", headers: { cookie } }),
      () => app.inject({ method: "GET", url: "/subjects?limit=20&offset=0", headers: { cookie } }),
      () => app.inject({ method: "GET", url: `/subjects/${subjectId}/overview`, headers: { cookie } }),
      () =>
        app.inject({
          method: "GET",
          url: `/subjects/${subjectId}/proofs?limit=10&offset=0`,
          headers: { cookie, "x-proof-view": "internal" },
        }),
      () =>
        app.inject({ method: "GET", url: `/subjects/${subjectId}/events?limit=10&offset=0`, headers: { cookie } }),
      () =>
        app.inject({
          method: "GET",
          url: `/subjects/${subjectId}/failures?limit=10&offset=0`,
          headers: { cookie },
        }),
      () =>
        app.inject({
          method: "GET",
          url: `/subjects/${subjectId}/lineages?limit=10&offset=0`,
          headers: { cookie },
        }),
      () => app.inject({ method: "GET", url: `/subjects/${subjectId}/baselines`, headers: { cookie } }),
    ];

    const rounds = 8;
    const concurrency = 12;

    for (let r = 0; r < rounds; r++) {
      const wave: Promise<{ statusCode: number }>[] = [];
      for (let c = 0; c < concurrency; c++) {
        for (const p of paths) {
          wave.push(p());
        }
      }
      const results = await Promise.all(wave);
      for (const res of results) {
        expect(res.statusCode).toBe(200);
        expect(res.statusCode).toBeLessThan(500);
      }
    }
  });

  it("overview and baselines stay contract-stable under load", async () => {
    const ov = await app.inject({
      method: "GET",
      url: `/subjects/${subjectId}/overview`,
      headers: { cookie },
    });
    expect(ov.statusCode).toBe(200);
    const o = JSON.parse(ov.payload) as {
      angles_summary: unknown[];
      metadata: unknown;
      status_strip: { lineage_count: number };
    };
    expect(o.angles_summary.length).toBe(7);
    expect(o.metadata).not.toBe(null);
    expect(typeof o.metadata).toBe("object");
    expect(typeof o.status_strip.lineage_count).toBe("number");

    const bl = await app.inject({
      method: "GET",
      url: `/subjects/${subjectId}/baselines`,
      headers: { cookie },
    });
    expect(bl.statusCode).toBe(200);
    const b = JSON.parse(bl.payload) as { baselines: unknown[] };
    expect(b.baselines.length).toBe(7);
  });

  it("invalid uuid returns 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/subjects/not-a-uuid/overview",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it("missing cookie returns 401 for overview", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/subjects/${subjectId}/overview`,
    });
    expect(res.statusCode).toBe(401);
  });
});
