import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signUp } from "./auth-session.js";
import { openPgliteMemory } from "../db/pglite.js";
import { buildSubjectOverview } from "./overview-read-model.js";
import { clearEnvironmentGeneratedState } from "./sandbox-env-reset.js";
import { DEMO_SUBJECT_RAIL_ORDER, demoSandboxSubjectId, runSandboxScenario } from "./sandbox-scenario-runner.js";

describe("targeted demo scenario truth (clean vs failure vs version)", () => {
  it(
    "clean_proof yields conformant aggregate snapshot; failure yields violated; version_update ends conformant",
    async () => {
      const { client, db } = await openPgliteMemory();
      try {
        const email = `demo-truth-${randomUUID()}@aproof.test`;
        const su = await signUp(db, {
          email,
          password: "demo_truth_pw_12345",
          organization_name: "Demo Truth Org",
        });
        if (!su.ok) throw new Error("signUp failed");
        const { organization_id: orgId, environment_id: envId } = su;

        await runSandboxScenario(db, {
          organizationId: orgId,
          environmentId: envId,
          template: "demo_all_rails",
        });

        for (const rail of DEMO_SUBJECT_RAIL_ORDER) {
          const subjectId = demoSandboxSubjectId(envId, rail);
          const initial = await buildSubjectOverview(db, {
            subjectId,
            organizationId: orgId,
            environmentId: envId,
            environmentName: "testnet",
          });
          expect(initial?.status_strip.total_events, `${rail} starts empty`).toBe(0);

          await runSandboxScenario(db, {
            organizationId: orgId,
            environmentId: envId,
            template: "demo_all_rails",
            targeted: { rail, demo_action: "clean_proof" },
          });
          const ovClean = await buildSubjectOverview(db, {
            subjectId,
            organizationId: orgId,
            environmentId: envId,
            environmentName: "testnet",
          });
          expect(ovClean?.latest_proof_snapshot.status, `${rail} clean`).toBe("conformant");
          expect(ovClean?.status_strip.total_events, `${rail} clean stacks`).toBe(1);

          await runSandboxScenario(db, {
            organizationId: orgId,
            environmentId: envId,
            template: "demo_all_rails",
            targeted: { rail, demo_action: "failure" },
          });
          const ovFail = await buildSubjectOverview(db, {
            subjectId,
            organizationId: orgId,
            environmentId: envId,
            environmentName: "testnet",
          });
          expect(ovFail?.latest_proof_snapshot.status, `${rail} failure`).toBe("violated");
          expect(ovFail?.status_strip.total_events, `${rail} failure stacks`).toBe(2);

          await runSandboxScenario(db, {
            organizationId: orgId,
            environmentId: envId,
            template: "demo_all_rails",
            targeted: { rail, demo_action: "version_update" },
          });
          const ovVer = await buildSubjectOverview(db, {
            subjectId,
            organizationId: orgId,
            environmentId: envId,
            environmentName: "testnet",
          });
          expect(ovVer?.latest_proof_snapshot.status, `${rail} version`).toBe("conformant");
          expect(ovVer?.status_strip.total_events, `${rail} version stacks`).toBe(4);
        }

        await clearEnvironmentGeneratedState(db, { organizationId: orgId, environmentId: envId });
        await runSandboxScenario(db, {
          organizationId: orgId,
          environmentId: envId,
          template: "demo_all_rails",
        });
        for (const rail of DEMO_SUBJECT_RAIL_ORDER) {
          const subjectId = demoSandboxSubjectId(envId, rail);
          const reset = await buildSubjectOverview(db, {
            subjectId,
            organizationId: orgId,
            environmentId: envId,
            environmentName: "testnet",
          });
          expect(reset?.status_strip.total_events, `${rail} reset starts empty`).toBe(0);
        }
      } finally {
        await client.close();
      }
    },
    120_000,
  );
});
