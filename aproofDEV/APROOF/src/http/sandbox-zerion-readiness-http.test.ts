import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openPgliteMemory } from "../db/pglite.js";
import { buildServer } from "./server.js";

describe("GET /sandbox/zerion-readiness (HTTP)", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const k of ["ZERION_API_KEY", "ZERION_CLI_PATH", "SOLANA_RPC_URL"]) {
      saved.set(k, process.env[k]);
    }
    process.env.ZERION_API_KEY = "aproof_test_zerion_key_value_do_not_echo";
    process.env.ZERION_CLI_PATH = "scripts/zerion-cli-devnet-stub.mjs";
    process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
  });

  afterEach(() => {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    saved.clear();
  });

  it(
    "returns readiness JSON with required fields and never echoes ZERION_API_KEY value",
    async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const app = buildServer(db);
      const signUp = await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: {
          email: `zr-${randomUUID().slice(0, 8)}@aproof.test`,
          password: "secure_password_123",
          organization_name: "Zerion Readiness Org",
        },
      });
      expect(signUp.statusCode).toBe(201);
      const setCookie = signUp.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const sessionCookie = cookieStr!.split(";")[0];

      const res = await app.inject({
        method: "GET",
        url: "/sandbox/zerion-readiness",
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload) as Record<string, unknown>;
      expect(body.zerion_api_key_present === true || body.zerion_api_key_present === false).toBe(true);
      expect(typeof body.execution_ready).toBe("boolean");
      expect(typeof body.anchor_ready).toBe("boolean");
      expect(typeof body.anchor_balance_ready).toBe("boolean");
      expect(typeof body.integration_ready).toBe("boolean");
      expect(body.execution_readiness_blocker === null || typeof body.execution_readiness_blocker === "string").toBe(
        true,
      );
      expect(body.anchor_readiness_blocker === null || typeof body.anchor_readiness_blocker === "string").toBe(true);
      expect(
        body.integration_readiness_blocker === null || typeof body.integration_readiness_blocker === "string",
      ).toBe(true);
      expect(Array.isArray(body.what_is_working)).toBe(true);
      expect(Array.isArray(body.what_is_next)).toBe(true);
      expect(typeof body.zerion_agent_keypair_present).toBe("boolean");
      expect(typeof body.zerion_agent_keypair_exists).toBe("boolean");
      expect(typeof body.zerion_agent_keypair_is_file).toBe("boolean");
      expect(typeof body.solana_keypair_path_present).toBe("boolean");
      expect(typeof body.solana_keypair_path_exists).toBe("boolean");
      expect(typeof body.solana_keypair_path_is_file).toBe("boolean");
      expect(typeof body.local_devnet_executor_path_active).toBe("boolean");
      expect(typeof body.live_solana_devnet_execution_enabled).toBe("boolean");

      const raw = res.payload;
      expect(raw).not.toContain("aproof_test_zerion_key_value_do_not_echo");
      expect(raw).not.toMatch(/ZERION_API_KEY\s*[:=]\s*[^\s"']/);

      await app.close();
    } finally {
      await client.close();
    }
  },
  30_000,
  );
});
