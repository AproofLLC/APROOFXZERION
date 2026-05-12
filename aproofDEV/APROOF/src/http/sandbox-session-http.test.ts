import { describe, expect, it } from "vitest";
import { openPgliteMemory } from "../db/pglite.js";
import { buildServer } from "./server.js";

describe("POST /sandbox/session", () => {
  it(
    "accepts template and returns bootstrap subject ids",
    async () => {
      const { client, db } = await openPgliteMemory();
      const prevGuard = process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO;
      process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = "0";
      try {
        const app = buildServer(db);
        const res = await app.inject({
          method: "POST",
          url: "/sandbox/session",
          payload: {
            organization_name: "HTTP Sandbox Org",
            template: "clean_first_proof",
          },
        });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.payload) as {
          ok?: boolean;
          template?: string;
          primary_subject_id?: string;
          subject_ids?: string[];
        };
        expect(body.ok).toBe(true);
        expect(body.template).toBe("clean_first_proof");
        expect(body.primary_subject_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        expect(Array.isArray(body.subject_ids)).toBe(true);
        await app.close();
      } finally {
        process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = prevGuard;
        await client.close();
      }
    },
    25_000,
  );

  it(
    "rejects unknown template",
    async () => {
      const { client, db } = await openPgliteMemory();
      const prevGuard = process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO;
      process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = "0";
      try {
        const app = buildServer(db);
        const res = await app.inject({
          method: "POST",
          url: "/sandbox/session",
          payload: { template: "not_a_real_template" },
        });
        expect(res.statusCode).toBe(400);
        await app.close();
      } finally {
        process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = prevGuard;
        await client.close();
      }
    },
    25_000,
  );

  it("rejects sandbox session when devnet guard is enabled and anchor mode is not devnet", async () => {
    const { client, db } = await openPgliteMemory();
    const prevGuard = process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO;
    const prevMode = process.env.ANCHOR_MODE;
    process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = "1";
    process.env.ANCHOR_MODE = "mock";
    try {
      const app = buildServer(db);
      const res = await app.inject({
        method: "POST",
        url: "/sandbox/session",
        payload: { template: "clean_first_proof" },
      });
      expect(res.statusCode).toBe(412);
      const body = JSON.parse(res.payload) as { error?: { code?: string } };
      expect(body.error?.code).toBe("DEMO_REQUIRES_DEVNET");
      await app.close();
    } finally {
      process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = prevGuard;
      process.env.ANCHOR_MODE = prevMode;
      await client.close();
    }
  });
});

describe("POST /sandbox/reset", () => {
  it(
    "starts and resets Zerion Agent demo with empty event state",
    async () => {
      const { client, db } = await openPgliteMemory();
      const prevGuard = process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO;
      process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = "0";
      try {
        const app = buildServer(db);
        const session = await app.inject({
          method: "POST",
          url: "/sandbox/session",
          payload: { template: "demo_all_rails" },
        });
        expect(session.statusCode).toBe(201);
        const setCookie = session.headers["set-cookie"];
        const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
        const sessionCookie = cookieStr!.split(";")[0]!;
        const sessionBody = JSON.parse(session.payload) as {
          primary_subject_id?: string;
          subject_ids_by_rail?: Record<string, string>;
        };
        const subjectId = sessionBody.subject_ids_by_rail?.agent ?? sessionBody.primary_subject_id;
        expect(subjectId).toBeDefined();

        const initialOverview = await app.inject({
          method: "GET",
          url: `/subjects/${subjectId}/overview`,
          headers: { cookie: sessionCookie },
        });
        expect(initialOverview.statusCode).toBe(200);
        expect((JSON.parse(initialOverview.payload) as { status_strip?: { total_events?: number } }).status_strip?.total_events).toBe(0);

        const targeted = await app.inject({
          method: "POST",
          url: "/sandbox/reset",
          headers: { cookie: sessionCookie, "content-type": "application/json" },
          payload: { template: "demo_all_rails", demo_rail: "agent", demo_action: "clean_proof" },
        });
        expect(targeted.statusCode).toBe(200);
        const afterTargeted = await app.inject({
          method: "GET",
          url: `/subjects/${subjectId}/overview`,
          headers: { cookie: sessionCookie },
        });
        expect(afterTargeted.statusCode).toBe(200);
        expect((JSON.parse(afterTargeted.payload) as { status_strip?: { total_events?: number } }).status_strip?.total_events).toBe(1);

        const reset = await app.inject({
          method: "POST",
          url: "/sandbox/reset",
          headers: { cookie: sessionCookie, "content-type": "application/json" },
          payload: { template: "demo_all_rails" },
        });
        expect(reset.statusCode).toBe(200);
        const afterReset = await app.inject({
          method: "GET",
          url: `/subjects/${subjectId}/overview`,
          headers: { cookie: sessionCookie },
        });
        expect(afterReset.statusCode).toBe(200);
        expect((JSON.parse(afterReset.payload) as { status_strip?: { total_events?: number } }).status_strip?.total_events).toBe(0);
        await app.close();
      } finally {
        process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = prevGuard;
        await client.close();
      }
    },
    30_000,
  );

  it(
    "rejects targeted demo when demo_rail is not agent",
    async () => {
      const { client, db } = await openPgliteMemory();
      const prevGuard = process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO;
      process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = "0";
      try {
        const app = buildServer(db);
        const session = await app.inject({
          method: "POST",
          url: "/sandbox/session",
          payload: { template: "demo_all_rails" },
        });
        expect(session.statusCode).toBe(201);
        const setCookie = session.headers["set-cookie"];
        const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
        const sessionCookie = cookieStr!.split(";")[0]!;

        const badRail = await app.inject({
          method: "POST",
          url: "/sandbox/reset",
          headers: { cookie: sessionCookie, "content-type": "application/json" },
          payload: { template: "demo_all_rails", demo_rail: "model", demo_action: "clean_proof" },
        });
        expect(badRail.statusCode).toBe(400);
        await app.close();
      } finally {
        process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = prevGuard;
        await client.close();
      }
    },
    30_000,
  );

  it(
    "replays scenario for testnet session",
    async () => {
      const { client, db } = await openPgliteMemory();
      const prevGuard = process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO;
      process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = "0";
      try {
        const app = buildServer(db);
        const session = await app.inject({
          method: "POST",
          url: "/sandbox/session",
          payload: { template: "clean_first_proof" },
        });
        expect(session.statusCode).toBe(201);
        const setCookie = session.headers["set-cookie"];
        const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
        const sessionCookie = cookieStr!.split(";")[0]!;

        const reset = await app.inject({
          method: "POST",
          url: "/sandbox/reset",
          headers: { cookie: sessionCookie, "content-type": "application/json" },
          payload: { template: "clean_first_proof" },
        });
        expect(reset.statusCode).toBe(200);
        const body = JSON.parse(reset.payload) as { ok?: boolean; primary_subject_id?: string };
        expect(body.ok).toBe(true);
        expect(body.primary_subject_id).toBeDefined();
        await app.close();
      } finally {
        process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = prevGuard;
        await client.close();
      }
    },
    30_000,
  );
});
