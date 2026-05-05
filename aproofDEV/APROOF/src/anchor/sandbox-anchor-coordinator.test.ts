import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asc, count, eq } from "drizzle-orm";
import { openPgliteMemory } from "../db/pglite.js";
import { anchorBatches, proofUnits } from "../db/schema/index.js";
import { signUp } from "../http/auth-session.js";
import { processEvent } from "../pipeline/process-event.js";
import { APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY, createSubject } from "../http/subject-service.js";
import { cleanSystemControlPayload } from "../demo/demo-clean-payloads.js";
import { mvpAnchorBatchHashes, proofDigest } from "../protocol/anchor-batch-hash.js";
import {
  formatSandboxAnchorPayload,
  SANDBOX_ANCHOR_BATCH_MAX_UNITS,
  SOLANA_SANDBOX_ROUTE,
} from "./sandbox-anchor-constants.js";
import { runSandboxAnchorCoordinatorForSubject } from "./sandbox-anchor-coordinator.js";
import { simulatedSignatureFromBatchHash, simulatedSlotFromBatchHash } from "./solana-simulated-attestation.js";

describe("sandbox anchor route", () => {
  it("creates persisted batches with solana-sandbox label, deterministic hash, aproof:v1 payload, and simulated attestation", async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const email = `anch-${randomUUID()}@aproof.test`;
      const su = await signUp(db, {
        email,
        password: "anchor_test_pw_123456",
        organization_name: "Anchor Org",
      });
      if (!su.ok) throw new Error("signUp failed");
      const { organization_id: orgId, environment_id: envId } = su;

      const { subject_id: subjectId } = await createSubject(db, { organizationId: orgId, environmentId: envId, railType: "system" });

      const r = await processEvent(db, {
        organization_id: orgId,
        environment_id: envId,
        subject_id: subjectId,
        source_type_key: APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY,
        trace_id: "anchor-test-trace",
        occurred_at: new Date("2020-01-15T10:00:00.000Z"),
        payload: cleanSystemControlPayload(),
      });
      if (!r.ok) throw new Error("processEvent failed");

      const { batchesCreated } = await runSandboxAnchorCoordinatorForSubject(db, {
        subjectId,
        organizationId: orgId,
        environmentId: envId,
      });
      const unitsPerEvent = r.proof_units.length;
      const expectedBatches = Math.ceil(unitsPerEvent / SANDBOX_ANCHOR_BATCH_MAX_UNITS);
      expect(batchesCreated).toBe(expectedBatches);

      const [bcount] = await db.select({ c: count() }).from(anchorBatches);
      expect(Number(bcount?.c)).toBe(expectedBatches);

      const [b0] = await db.select().from(anchorBatches).orderBy(asc(anchorBatches.createdAt)).limit(1);
      expect(b0).toBeDefined();
      expect(b0!.chainName).toBe(SOLANA_SANDBOX_ROUTE);
      expect(b0!.chainFamily).toBe("solana");
      expect(b0!.cluster).toBe("sandbox-devnet");
      expect(b0!.externalAttested).toBe(false);
      expect(b0!.txRef).toBeNull();
      expect(b0!.anchorPayload).toBe(formatSandboxAnchorPayload(b0!.batchHash));
      expect(b0!.anchorPayload).toMatch(/^aproof:v1:[a-f0-9]+$/);
      expect(b0!.simulatedSignature).toBe(simulatedSignatureFromBatchHash(b0!.batchHash));
      expect(b0!.simulatedSlot).toBe(simulatedSlotFromBatchHash(b0!.batchHash));
      expect(simulatedSignatureFromBatchHash(b0!.batchHash)).toBe(
        simulatedSignatureFromBatchHash(b0!.batchHash),
      );

      const firstTwo = await db
        .select({ proofId: proofUnits.proofId, angle: proofUnits.angle, status: proofUnits.status, deltaCode: proofUnits.deltaCode })
        .from(proofUnits)
        .where(eq(proofUnits.subjectId, subjectId))
        .orderBy(asc(proofUnits.createdAt), asc(proofUnits.proofId))
        .limit(2);
      const h2 = mvpAnchorBatchHashes(
        firstTwo.map((u) =>
          proofDigest({
            proof_id: u.proofId,
            angle: u.angle,
            status: u.status,
            delta_code: u.deltaCode,
          }),
        ),
      );
      expect(b0!.batchHash).toBe(h2.batchHash);

      const units = await db
        .select({ anchorState: proofUnits.anchorState })
        .from(proofUnits)
        .where(eq(proofUnits.subjectId, subjectId));
      for (const u of units) {
        expect(u.anchorState).toBe("confirmed");
      }
    } finally {
      await client.close();
    }
  }, 30_000);

  it("does not silently fallback to mock when solana-devnet config fails", async () => {
    const prev = {
      ANCHOR_MODE: process.env.ANCHOR_MODE,
      SOLANA_KEYPAIR_PATH: process.env.SOLANA_KEYPAIR_PATH,
      SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
      SOLANA_CLUSTER: process.env.SOLANA_CLUSTER,
    };
    process.env.ANCHOR_MODE = "solana-devnet";
    process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
    process.env.SOLANA_CLUSTER = "devnet";
    process.env.SOLANA_KEYPAIR_PATH = "Z:/non-existent/anchor-devnet.json";
    const { client, db } = await openPgliteMemory();
    try {
      const su = await signUp(db, {
        email: `anch-fail-${randomUUID()}@aproof.test`,
        password: "anchor_test_pw_123456",
        organization_name: "Anchor Org",
      });
      if (!su.ok) throw new Error("signUp failed");
      const { organization_id: orgId, environment_id: envId } = su;
      const { subject_id: subjectId } = await createSubject(db, { organizationId: orgId, environmentId: envId, railType: "system" });
      const r = await processEvent(db, {
        organization_id: orgId,
        environment_id: envId,
        subject_id: subjectId,
        source_type_key: APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY,
        trace_id: "anchor-test-fail-trace",
        occurred_at: new Date("2020-01-15T10:00:00.000Z"),
        payload: cleanSystemControlPayload(),
      });
      if (!r.ok) throw new Error("processEvent failed");
      await runSandboxAnchorCoordinatorForSubject(db, {
        subjectId,
        organizationId: orgId,
        environmentId: envId,
      });
      const [b0] = await db.select().from(anchorBatches).orderBy(asc(anchorBatches.createdAt)).limit(1);
      expect(b0).toBeDefined();
      expect(b0!.anchorMode).toBe("solana-devnet");
      expect(b0!.status).toBe("failed");
      expect(b0!.txSignature).toBeNull();
      expect(b0!.explorerUrl).toBeNull();
      expect(String(b0!.errorMessage ?? "")).toMatch(/SOLANA_CONFIG_INVALID/);
    } finally {
      process.env.ANCHOR_MODE = prev.ANCHOR_MODE;
      process.env.SOLANA_KEYPAIR_PATH = prev.SOLANA_KEYPAIR_PATH;
      process.env.SOLANA_RPC_URL = prev.SOLANA_RPC_URL;
      process.env.SOLANA_CLUSTER = prev.SOLANA_CLUSTER;
      await client.close();
    }
  }, 30_000);
});
