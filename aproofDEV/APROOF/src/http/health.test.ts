import { describe, expect, it } from "vitest";
import { openPgliteMemory } from "../db/pglite.js";
import { buildServer } from "./server.js";

describe("GET /health", () => {
  it("returns ok JSON without authentication", async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const app = buildServer(db);
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, status: "ok", service: "aproof" });
      await app.close();
    } finally {
      await client.close();
    }
  });
});
