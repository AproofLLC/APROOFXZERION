import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openPgliteMemory } from "../db/pglite.js";
import { buildServer } from "./server.js";

describe("GET /subjects/:id/overview (HTTP)", () => {
  it(
    "returns 200 overview after sign-up and subject creation",
    async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const app = buildServer(db);
      const email = `ov-http-${randomUUID().slice(0, 8)}@aproof.test`;
      const signUp = await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: {
          email,
          password: "secure_password_123",
          organization_name: "Ov HTTP Org",
        },
      });
      expect(signUp.statusCode).toBe(201);
      const setCookie = signUp.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const sessionCookie = cookieStr!.split(";")[0];

      const subRes = await app.inject({
        method: "POST",
        url: "/subjects",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        payload: { subject_type: "service" },
      });
      expect(subRes.statusCode).toBe(201);
      const subjectId = JSON.parse(subRes.payload).subject_id as string;

      const ov = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/overview`,
        headers: { cookie: sessionCookie },
      });
      expect(ov.statusCode).toBe(200);
      const body = JSON.parse(ov.payload);
      expect(body.subject_header.subject_id).toBe(subjectId);
      expect(body.status_strip).toBeDefined();
      await app.close();
    } finally {
      await client.close();
    }
    },
    20_000,
  );
});
