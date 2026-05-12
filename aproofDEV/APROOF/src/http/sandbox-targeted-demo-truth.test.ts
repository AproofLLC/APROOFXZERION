import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import { and, asc, desc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as zerionExecutionAdapter from "../zerion/zerion-execution-adapter.js";
import { canonicalEvents } from "../db/schema/index.js";
import { signUp } from "./auth-session.js";
import { openPgliteMemory } from "../db/pglite.js";
import { buildSubjectOverview } from "./overview-read-model.js";
import { clearEnvironmentGeneratedState } from "./sandbox-env-reset.js";
import { demoZerionAgentSubjectId, runSandboxScenario } from "./sandbox-scenario-runner.js";
import { listSubjects } from "./subject-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ZERION_CLI_STUB = join(__dirname, "../../scripts/zerion-cli-devnet-stub.mjs");
const AUTHORIZED_RECIPIENT = Keypair.generate().publicKey.toBase58();
const CONTINUITY_RECIPIENT = "11111111111111111111111111111111";

const ZERION_ENV_KEYS = [
  "ZERION_API_KEY",
  "ZERION_CLI_PATH",
  "ZERION_AGENT_WALLET_ADDRESS",
  "SOLANA_RPC_URL",
  "ZERION_ALLOWED_CHAIN",
  "ZERION_MAX_SPEND_USD",
  "ZERION_APPROVED_ASSETS",
  "APROOF_SUBJECT_ID",
  "APROOF_ENV",
  "SOLANA_KEYPAIR_PATH",
  "ZERION_AUTHORIZED_RECIPIENT_ADDRESS",
  "ZERION_CONTINUITY_RECIPIENT_ADDRESS",
] as const;

function saveZerionEnv(): Record<string, string | undefined> {
  const o: Record<string, string | undefined> = {};
  for (const k of ZERION_ENV_KEYS) o[k] = process.env[k];
  return o;
}

function restoreZerionEnv(saved: Record<string, string | undefined>) {
  for (const k of ZERION_ENV_KEYS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function clearZerionEnv() {
  for (const k of ZERION_ENV_KEYS) delete process.env[k];
}

function applyStubZerionEnv() {
  process.env.ZERION_API_KEY = "test_zerion_api_key";
  process.env.ZERION_CLI_PATH = ZERION_CLI_STUB;
  process.env.ZERION_AGENT_WALLET_ADDRESS = "DevnetWalletStub11111111111111111111111111";
  process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
  process.env.ZERION_ALLOWED_CHAIN = "solana-devnet";
  process.env.ZERION_MAX_SPEND_USD = "5";
  process.env.ZERION_APPROVED_ASSETS = "SOL,USDC";
  process.env.APROOF_SUBJECT_ID = "zerion-agent";
  process.env.APROOF_ENV = "solana-devnet";
  const dir = join(tmpdir(), `zerion-stub-kp-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const kpPath = join(dir, "devnet-kp.json");
  writeFileSync(kpPath, JSON.stringify(Array.from(Keypair.generate().secretKey)), "utf8");
  process.env.SOLANA_KEYPAIR_PATH = kpPath;
  process.env.ZERION_AUTHORIZED_RECIPIENT_ADDRESS = AUTHORIZED_RECIPIENT;
  process.env.ZERION_CONTINUITY_RECIPIENT_ADDRESS = CONTINUITY_RECIPIENT;
}

describe("targeted demo scenario truth (clean vs failure vs version)", () => {
  it("demo_all_rails bootstraps a single Zerion Agent subject and agent-only rail map", async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const email = `zerion-boot-${randomUUID()}@aproof.test`;
      const su = await signUp(db, {
        email,
        password: "zerion_boot_pw_12345",
        organization_name: "Zerion Boot Org",
      });
      if (!su.ok) throw new Error("signUp failed");
      const { organization_id: orgId, environment_id: envId } = su;

      const boot = await runSandboxScenario(db, {
        organizationId: orgId,
        environmentId: envId,
        template: "demo_all_rails",
      });
      expect(boot.subject_ids).toHaveLength(1);
      expect(boot.subject_ids_by_rail).toEqual({ agent: demoZerionAgentSubjectId(envId) });

      const listed = await listSubjects(db, { organizationId: orgId, environmentId: envId, limit: 50, offset: 0 });
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0]!.subject_id).toBe(demoZerionAgentSubjectId(envId));
    } finally {
      await client.close();
    }
  });

  it(
    "without Zerion integration env, clean_proof is violated (integration not ready) and does not invoke CLI",
    async () => {
      const saved = saveZerionEnv();
      clearZerionEnv();
      const cliSpy = vi.spyOn(zerionExecutionAdapter, "runZerionCliExecution");
      const { client, db } = await openPgliteMemory();
      try {
        const email = `demo-truth-noint-${randomUUID()}@aproof.test`;
        const su = await signUp(db, {
          email,
          password: "demo_truth_pw_12345",
          organization_name: "Demo Truth Org",
        });
        if (!su.ok) throw new Error("signUp failed");
        const { organization_id: orgId, environment_id: envId } = su;
        await runSandboxScenario(db, { organizationId: orgId, environmentId: envId, template: "demo_all_rails" });
        const subjectId = demoZerionAgentSubjectId(envId);

        await runSandboxScenario(db, {
          organizationId: orgId,
          environmentId: envId,
          template: "demo_all_rails",
          targeted: { demo_action: "clean_proof" },
        });
        const ov = await buildSubjectOverview(db, {
          subjectId,
          organizationId: orgId,
          environmentId: envId,
          environmentName: "testnet",
        });
        expect(ov?.latest_proof_snapshot.status).toBe("violated");
        const op = ov?.active_failures_list?.find((f) => f.angle === "operational_integrity");
        expect(op?.reason_code).toBe("ZERION_INTEGRATION_NOT_READY");
        expect(cliSpy).not.toHaveBeenCalled();
      } finally {
        cliSpy.mockRestore();
        restoreZerionEnv(saved);
        await client.close();
      }
    },
    120_000,
  );

  it(
    "with stub Zerion CLI env: clean conformant; failure violates operational with POLICY_SPEND_LIMIT_EXCEEDED and skips CLI; version_update stays conformant with lineage",
    async () => {
      const saved = saveZerionEnv();
      applyStubZerionEnv();
      const cliSpy = vi.spyOn(zerionExecutionAdapter, "runZerionCliExecution");
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

        const subjectId = demoZerionAgentSubjectId(envId);
        const initial = await buildSubjectOverview(db, {
          subjectId,
          organizationId: orgId,
          environmentId: envId,
          environmentName: "testnet",
        });
        expect(initial?.status_strip.total_events).toBe(0);

        await runSandboxScenario(db, {
          organizationId: orgId,
          environmentId: envId,
          template: "demo_all_rails",
          targeted: { demo_action: "clean_proof" },
        });
        const ovClean = await buildSubjectOverview(db, {
          subjectId,
          organizationId: orgId,
          environmentId: envId,
          environmentName: "testnet",
        });
        expect(ovClean?.latest_proof_snapshot.status).toBe("conformant");
        expect(ovClean?.status_strip.total_events).toBe(1);
        expect(cliSpy).toHaveBeenCalledTimes(1);

        const lastPayload = await db
          .select({ payload: canonicalEvents.payload })
          .from(canonicalEvents)
          .where(
            and(
              eq(canonicalEvents.organizationId, orgId),
              eq(canonicalEvents.environmentId, envId),
              eq(canonicalEvents.subjectId, subjectId),
            ),
          )
          .orderBy(desc(canonicalEvents.occurredAt))
          .limit(1);
        const z =
          lastPayload[0]?.payload && typeof lastPayload[0].payload === "object"
            ? (lastPayload[0].payload as Record<string, unknown>).zerion
            : null;
        expect(z && typeof z === "object" && typeof (z as Record<string, unknown>).tx_hash).toBe("string");
        expect(String((z as Record<string, unknown>).tx_hash).length).toBeGreaterThanOrEqual(32);
        expect((z as Record<string, unknown>).recipient_address).toBe(AUTHORIZED_RECIPIENT);
        expect(cliSpy.mock.calls[0]?.[0]).toMatchObject({ recipient_address: AUTHORIZED_RECIPIENT });

        await runSandboxScenario(db, {
          organizationId: orgId,
          environmentId: envId,
          template: "demo_all_rails",
          targeted: { demo_action: "failure" },
        });
        const ovFail = await buildSubjectOverview(db, {
          subjectId,
          organizationId: orgId,
          environmentId: envId,
          environmentName: "testnet",
        });
        expect(ovFail?.latest_proof_snapshot.status).toBe("violated");
        expect(ovFail?.status_strip.total_events).toBe(2);
        const opFail = ovFail?.active_failures_list?.find((f) => f.angle === "operational_integrity");
        expect(opFail?.reason_code).toBe("POLICY_SPEND_LIMIT_EXCEEDED");
        expect(cliSpy).toHaveBeenCalledTimes(1);
        const failPayload = await db
          .select({ payload: canonicalEvents.payload })
          .from(canonicalEvents)
          .where(
            and(
              eq(canonicalEvents.organizationId, orgId),
              eq(canonicalEvents.environmentId, envId),
              eq(canonicalEvents.subjectId, subjectId),
            ),
          )
          .orderBy(desc(canonicalEvents.occurredAt))
          .limit(1);
        const zf = failPayload[0]?.payload && typeof failPayload[0].payload === "object" ? (failPayload[0].payload as Record<string, unknown>).zerion : null;
        expect(zf && typeof zf === "object" && (zf as Record<string, unknown>).cli_invoked).toBe(false);
        expect(zf && typeof zf === "object" && (zf as Record<string, unknown>).tx_hash).toBeNull();

        await runSandboxScenario(db, {
          organizationId: orgId,
          environmentId: envId,
          template: "demo_all_rails",
          targeted: { demo_action: "version_update" },
        });
        const ovVer = await buildSubjectOverview(db, {
          subjectId,
          organizationId: orgId,
          environmentId: envId,
          environmentName: "testnet",
        });
        expect(ovVer?.latest_proof_snapshot.status).toBe("conformant");
        expect(ovVer?.status_strip.total_events).toBe(4);
        expect(cliSpy).toHaveBeenCalledTimes(3);
        expect(cliSpy.mock.calls[1]?.[0]).toMatchObject({ recipient_address: CONTINUITY_RECIPIENT });
        expect(cliSpy.mock.calls[2]?.[0]).toMatchObject({ recipient_address: CONTINUITY_RECIPIENT });

        const lineageTrace = await db
          .select({
            lineage: canonicalEvents.eventLineageId,
            ver: canonicalEvents.eventVersion,
            payload: canonicalEvents.payload,
          })
          .from(canonicalEvents)
          .where(
            and(
              eq(canonicalEvents.organizationId, orgId),
              eq(canonicalEvents.environmentId, envId),
              eq(canonicalEvents.subjectId, subjectId),
            ),
          )
          .orderBy(asc(canonicalEvents.occurredAt));
        const lastTwo = lineageTrace.slice(-2);
        expect(lastTwo).toHaveLength(2);
        expect(lastTwo[0]!.lineage).toBe(lastTwo[1]!.lineage);
        expect(new Set(lastTwo.map((r) => r.ver))).toEqual(new Set([1, 2]));
        const continuityRecipients = lastTwo.map((r) => {
          const zc = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>).zerion : null;
          return zc && typeof zc === "object" ? (zc as Record<string, unknown>).recipient_address : null;
        });
        expect(continuityRecipients).toEqual([
          CONTINUITY_RECIPIENT,
          CONTINUITY_RECIPIENT,
        ]);
        expect(AUTHORIZED_RECIPIENT).not.toBe(CONTINUITY_RECIPIENT);

        await clearEnvironmentGeneratedState(db, { organizationId: orgId, environmentId: envId });
        await runSandboxScenario(db, {
          organizationId: orgId,
          environmentId: envId,
          template: "demo_all_rails",
        });
        const reset = await buildSubjectOverview(db, {
          subjectId,
          organizationId: orgId,
          environmentId: envId,
          environmentName: "testnet",
        });
        expect(reset?.status_strip.total_events).toBe(0);
      } finally {
        cliSpy.mockRestore();
        restoreZerionEnv(saved);
        await client.close();
      }
    },
    120_000,
  );

  it(
    "without ZERION_AUTHORIZED_RECIPIENT_ADDRESS, clean_proof uses dedicated persisted authorized recipient (not continuity)",
    async () => {
      const saved = saveZerionEnv();
      const prevCwd = process.cwd();
      const work = join(tmpdir(), `zerion-no-auth-env-${randomUUID()}`);
      mkdirSync(work, { recursive: true });
      const cliSpy = vi.spyOn(zerionExecutionAdapter, "runZerionCliExecution");
      const { client, db } = await openPgliteMemory();
      try {
        process.chdir(work);
        applyStubZerionEnv();
        delete process.env.ZERION_AUTHORIZED_RECIPIENT_ADDRESS;
        process.env.ZERION_CONTINUITY_RECIPIENT_ADDRESS = CONTINUITY_RECIPIENT;

        const email = `demo-truth-noauth-${randomUUID()}@aproof.test`;
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

        await runSandboxScenario(db, {
          organizationId: orgId,
          environmentId: envId,
          template: "demo_all_rails",
          targeted: { demo_action: "clean_proof" },
        });

        expect(cliSpy).toHaveBeenCalledTimes(1);
        const arg0 = cliSpy.mock.calls[0]?.[0];
        expect(arg0).toMatchObject({ scenario: "authorized_execution" });
        expect(arg0?.recipient_address).toBeTruthy();
        expect(arg0?.recipient_address).not.toBe(CONTINUITY_RECIPIENT);
      } finally {
        process.chdir(prevCwd);
        cliSpy.mockRestore();
        restoreZerionEnv(saved);
        await client.close();
      }
    },
    120_000,
  );
});
