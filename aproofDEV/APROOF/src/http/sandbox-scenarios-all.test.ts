import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signUp } from "./auth-session.js";
import { openPgliteMemory } from "../db/pglite.js";
import { SANDBOX_SCENARIO_TEMPLATES, runSandboxScenario } from "./sandbox-scenario-runner.js";

describe("sandbox scenario runner", () => {
  it(
    "seeds every template without error",
    async () => {
      const { client, db } = await openPgliteMemory();
      try {
        const email = `all-sc-${randomUUID()}@aproof.test`;
        const su = await signUp(db, {
          email,
          password: "all_scenarios_12345",
          organization_name: "All Scenarios Org",
        });
        if (!su.ok) throw new Error("signUp failed");
        for (const template of SANDBOX_SCENARIO_TEMPLATES) {
          const r = await runSandboxScenario(db, {
            organizationId: su.organization_id,
            environmentId: su.environment_id,
            template,
          });
          expect(r.primary_subject_id).toMatch(/^[0-9a-f-]{36}$/i);
          expect(r.subject_ids.length).toBeGreaterThan(0);
        }
      } finally {
        await client.close();
      }
    },
    60_000,
  );
});
