import { describe, expect, it } from "vitest";
import { openPgliteMemory } from "../db/pglite.js";
import { buildServer } from "./server.js";

function sessionCookieFrom(res: { headers: Record<string, string | string[] | undefined> }): string {
  const setCookie = res.headers["set-cookie"];
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return cookieStr!.split(";")[0]!;
}

async function createSubjectWithSession(app: ReturnType<typeof buildServer>, cookie: string): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: "/subjects",
    headers: { cookie, "content-type": "application/json" },
    payload: { subject_type: "service" },
  });
  expect(created.statusCode).toBe(201);
  const body = JSON.parse(created.payload) as { subject_id: string };
  return body.subject_id;
}

describe("user logs parity across production and testnet/sandbox", () => {
  it("returns the same canonical envelope shape in production and testnet", async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const app = buildServer(db);

      const prodAuth = await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: {
          email: `prod-user-${Date.now()}@aproof.test`,
          password: "test_password_123456",
          organization_name: "Prod Org",
        },
      });
      expect(prodAuth.statusCode).toBe(201);
      const prodCookie = sessionCookieFrom(prodAuth);
      const prodSubjectId = await createSubjectWithSession(app, prodCookie);

      const sandboxAuth = await app.inject({
        method: "POST",
        url: "/sandbox/session",
        payload: { template: "clean_first_proof" },
      });
      expect(sandboxAuth.statusCode).toBe(201);
      const sandboxCookie = sessionCookieFrom(sandboxAuth);
      const sandboxBody = JSON.parse(sandboxAuth.payload) as { primary_subject_id?: string };
      const sandboxSubjectId = sandboxBody.primary_subject_id ?? (await createSubjectWithSession(app, sandboxCookie));

      const prodRes = await app.inject({
        method: "GET",
        url: `/subjects/${prodSubjectId}/user-logs`,
        headers: { cookie: prodCookie },
      });
      const sandboxRes = await app.inject({
        method: "GET",
        url: `/subjects/${sandboxSubjectId}/user-logs`,
        headers: { cookie: sandboxCookie },
      });

      expect(prodRes.statusCode).toBe(200);
      expect(sandboxRes.statusCode).toBe(200);

      const prod = JSON.parse(prodRes.payload) as Record<string, unknown>;
      const sandbox = JSON.parse(sandboxRes.payload) as Record<string, unknown>;
      for (const body of [prod, sandbox]) {
        expect(typeof body.subject_id).toBe("string");
        expect(typeof body.environment).toBe("string");
        expect(Array.isArray(body.logs)).toBe(true);
        expect(body.pagination && typeof body.pagination === "object").toBe(true);
        expect("empty_reason" in body).toBe(true);
      }
      expect(prod.environment).toBe("production");
      expect(sandbox.environment).toBe("testnet");

      await app.close();
    } finally {
      await client.close();
    }
  }, 25_000);

  it("returns logs=[] for empty subjects", async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const app = buildServer(db);
      const auth = await app.inject({
        method: "POST",
        url: "/sandbox/session",
        payload: {},
      });
      expect(auth.statusCode).toBe(201);
      const cookie = sessionCookieFrom(auth);
      const subjectId = await createSubjectWithSession(app, cookie);

      const res = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/user-logs`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload) as {
        logs: unknown[];
        empty_reason: string | null;
      };
      expect(Array.isArray(body.logs)).toBe(true);
      expect(body.logs).toEqual([]);
      expect(body.empty_reason).toBe("no_logs_for_subject");
      await app.close();
    } finally {
      await client.close();
    }
  }, 25_000);

  it("keeps related ids consistent across user logs, events, proofs, and lineages", async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const app = buildServer(db);
      const auth = await app.inject({
        method: "POST",
        url: "/sandbox/session",
        payload: { template: "clean_first_proof" },
      });
      expect(auth.statusCode).toBe(201);
      const cookie = sessionCookieFrom(auth);
      const body = JSON.parse(auth.payload) as { primary_subject_id?: string };
      const subjectId = body.primary_subject_id!;

      const eventsRes = await app.inject({ method: "GET", url: `/subjects/${subjectId}/events`, headers: { cookie } });
      const proofsRes = await app.inject({ method: "GET", url: `/subjects/${subjectId}/proofs`, headers: { cookie } });
      const lineagesRes = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/lineages`,
        headers: { cookie },
      });
      expect(eventsRes.statusCode).toBe(200);
      expect(proofsRes.statusCode).toBe(200);
      expect(lineagesRes.statusCode).toBe(200);

      const eventId = (JSON.parse(eventsRes.payload) as { items: Array<{ event_id: string; trace_id?: string }> }).items[0]
        ?.event_id;
      const traceId = (JSON.parse(eventsRes.payload) as { items: Array<{ event_id: string; trace_id?: string }> }).items[0]
        ?.trace_id;
      const proofId = (JSON.parse(proofsRes.payload) as { items: Array<{ product_proof?: { proof_id?: string } }> }).items[0]
        ?.product_proof?.proof_id;
      const lineageFirst = (JSON.parse(lineagesRes.payload) as { items: Array<Record<string, unknown>> }).items[0];
      const lineageId =
        (typeof lineageFirst?.event_lineage_id === "string" ? lineageFirst.event_lineage_id : undefined) ??
        (typeof lineageFirst?.lineage_id === "string" ? lineageFirst.lineage_id : undefined) ??
        (typeof lineageFirst?.id === "string" ? lineageFirst.id : undefined);

      expect(eventId).toBeTruthy();
      expect(proofId).toBeTruthy();
      expect(lineageId).toBeTruthy();

      const write = await app.inject({
        method: "POST",
        url: `/subjects/${subjectId}/user-logs`,
        headers: { cookie, "content-type": "application/json" },
        payload: {
          logs: [
            {
              occurred_at: new Date().toISOString(),
              action_type: "sandbox_action",
              action_title: "linked handoff",
              source: "sandbox",
              trace_id: traceId ?? null,
              related_event_id: eventId,
              related_proof_id: proofId,
              related_lineage_id: lineageId,
              metadata: {},
            },
          ],
        },
      });
      expect(write.statusCode).toBe(201);

      const logsRes = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/user-logs`,
        headers: { cookie },
      });
      expect(logsRes.statusCode).toBe(200);
      const logs = JSON.parse(logsRes.payload) as { logs: Array<Record<string, unknown>> };
      const linked = logs.logs.find((l) => l.action_title === "linked handoff");
      expect(linked?.related_event_id).toBe(eventId);
      expect(linked?.related_proof_id).toBe(proofId);
      expect(linked?.related_lineage_id).toBe(lineageId);
      expect(linked?.trace_id ?? null).toBe(traceId ?? null);

      await app.close();
    } finally {
      await client.close();
    }
  }, 25_000);
});
