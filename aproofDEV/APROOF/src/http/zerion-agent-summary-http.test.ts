import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openPgliteMemory } from "../db/pglite.js";
import { demoZerionAgentSubjectId, runSandboxScenario } from "./sandbox-scenario-runner.js";
import { buildServer } from "./server.js";

describe("GET /subjects/:id/zerion-agent-summary (HTTP)", () => {
  it(
    "returns 200 JSON without secrets after sign-up and agent subject creation",
    async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const app = buildServer(db);
      const email = `za-sum-${randomUUID().slice(0, 8)}@aproof.test`;
      const signUp = await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: {
          email,
          password: "secure_password_123",
          organization_name: "Zerion Summary Org",
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
        payload: { subject_type: "agent" },
      });
      expect(subRes.statusCode).toBe(201);
      const subjectId = JSON.parse(subRes.payload).subject_id as string;

      const prevKey = process.env.ZERION_API_KEY;
      process.env.ZERION_API_KEY = "summary_test_secret_must_not_appear_in_http";
      try {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/zerion-agent-summary`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload) as Record<string, unknown>;
      expect(body.readiness && typeof body.readiness === "object").toBe(true);
      expect(body.policies && typeof body.policies === "object").toBe(true);
      expect(Array.isArray(body.transactions)).toBe(true);
      const rd = body.readiness as {
        what_is_working?: unknown;
        agent_wallet_public_address?: string;
        wallet_public_address?: string | null;
        execution_ready?: boolean;
        anchor_ready?: boolean;
        anchor_balance_ready?: boolean;
        integration_ready?: boolean;
        execution_readiness_blocker?: string | null;
        anchor_readiness_blocker?: string | null;
        integration_readiness_blocker?: string | null;
        zerion_agent_keypair_present?: boolean;
        zerion_agent_keypair_exists?: boolean;
        zerion_agent_keypair_is_file?: boolean;
        solana_keypair_path_present?: boolean;
        solana_keypair_path_exists?: boolean;
        solana_keypair_path_is_file?: boolean;
        local_devnet_executor_path_active?: boolean;
        live_solana_devnet_execution_enabled?: boolean;
        agent_execution_wallet_balance_sol?: number | null;
        solana_balance_sol?: number | null;
      };
      expect(Array.isArray(rd.what_is_working)).toBe(true);
      expect(Array.isArray((body.readiness as { what_is_next?: unknown }).what_is_next)).toBe(true);
      expect(typeof rd.agent_wallet_public_address === "string" || rd.agent_wallet_public_address === null).toBe(true);
      expect(rd.wallet_public_address === null || typeof rd.wallet_public_address === "string").toBe(true);
      for (const k of [
        "execution_ready",
        "anchor_ready",
        "anchor_balance_ready",
        "integration_ready",
        "zerion_agent_keypair_present",
        "zerion_agent_keypair_exists",
        "zerion_agent_keypair_is_file",
        "solana_keypair_path_present",
        "solana_keypair_path_exists",
        "solana_keypair_path_is_file",
        "local_devnet_executor_path_active",
        "live_solana_devnet_execution_enabled",
      ] as const) {
        expect(typeof rd[k]).toBe("boolean");
      }
      expect(
        rd.execution_readiness_blocker === null || typeof rd.execution_readiness_blocker === "string",
      ).toBe(true);
      expect(rd.anchor_readiness_blocker === null || typeof rd.anchor_readiness_blocker === "string").toBe(true);
      expect(
        rd.integration_readiness_blocker === null || typeof rd.integration_readiness_blocker === "string",
      ).toBe(true);
      expect(rd.agent_execution_wallet_balance_sol === null || typeof rd.agent_execution_wallet_balance_sol === "number").toBe(true);
      expect(rd.solana_balance_sol === null || typeof rd.solana_balance_sol === "number").toBe(true);

      const json = res.payload;
      expect(json).not.toContain("summary_test_secret_must_not_appear_in_http");
      expect(json).not.toMatch(/sk_live/i);
      expect(json).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
      } finally {
        if (prevKey === undefined) delete process.env.ZERION_API_KEY;
        else process.env.ZERION_API_KEY = prevKey;
      }

      const missing = await app.inject({
        method: "GET",
        url: `/subjects/${randomUUID()}/zerion-agent-summary`,
        headers: { cookie: sessionCookie },
      });
      expect(missing.statusCode).toBe(404);

      await app.close();
    } finally {
      await client.close();
    }
    },
    30_000,
  );

  it(
    "returns 200 for deterministic demo Zerion Agent subject UUID after demo_all_rails seed",
    async () => {
      const { client, db } = await openPgliteMemory();
      try {
        const app = buildServer(db);
        const email = `za-demo-${randomUUID().slice(0, 8)}@aproof.test`;
        const signUp = await app.inject({
          method: "POST",
          url: "/auth/sign-up",
          payload: {
            email,
            password: "secure_password_123",
            organization_name: "Zerion Demo Summary Org",
          },
        });
        expect(signUp.statusCode).toBe(201);
        const created = JSON.parse(signUp.payload) as { organization_id: string; environment_id: string };
        const setCookie = signUp.headers["set-cookie"];
        const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
        const sessionCookie = cookieStr!.split(";")[0];

        await runSandboxScenario(db, {
          organizationId: created.organization_id,
          environmentId: created.environment_id,
          template: "demo_all_rails",
        });
        const demoSubjectId = demoZerionAgentSubjectId(created.environment_id);

        const res = await app.inject({
          method: "GET",
          url: `/subjects/${demoSubjectId}/zerion-agent-summary`,
          headers: { cookie: sessionCookie },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload) as { transactions: unknown[] };
        expect(Array.isArray(body.transactions)).toBe(true);
        expect(body.transactions).toEqual([]);
        await app.close();
      } finally {
        await client.close();
      }
    },
    30_000,
  );
});
