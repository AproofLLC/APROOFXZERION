import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("HTTP auth route rate limiting", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("APROOF_AUTH_RL_MAX", "1");
    vi.stubEnv("APROOF_AUTH_RL_WINDOW_MS", "600000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it(
    "returns 429 on second POST /auth/sign-up from same IP within the window",
    async () => {
    const { openPgliteMemory } = await import("../db/pglite.js");
    const { buildServer } = await import("./server.js");
    const { client, db } = await openPgliteMemory();
    try {
      const app = buildServer(db);
      const base = { password: "secret12", organization_name: "RL" };
      const r1 = await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        headers: { "content-type": "application/json" },
        payload: { ...base, email: `rl1-${Date.now()}@t.test` },
      });
      expect(r1.statusCode).toBe(201);
      const r2 = await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        headers: { "content-type": "application/json" },
        payload: { ...base, email: `rl2-${Date.now()}@t.test` },
      });
      expect(r2.statusCode).toBe(429);
      const body = JSON.parse(r2.payload) as { error?: { code?: string } };
      expect(body.error?.code).toBe("RATE_LIMITED");
      await app.close();
    } finally {
      await client.close();
    }
    },
    30_000,
  );
});
