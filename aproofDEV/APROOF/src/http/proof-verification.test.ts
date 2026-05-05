import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { runSandboxAnchorCoordinatorForSubject } from "../anchor/sandbox-anchor-coordinator.js";
import { openPgliteMemory } from "../db/pglite.js";
import { anchorBatchItems, anchorBatches, proofUnits } from "../db/schema/index.js";
import { processEvent } from "../pipeline/process-event.js";
import { mvpAnchorBatchHashes, proofDigest } from "../protocol/anchor-batch-hash.js";
import { cleanSystemControlPayload } from "../demo/demo-clean-payloads.js";
import { APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY, createSubject } from "./subject-service.js";
import { signUp } from "./auth-session.js";
import { verifyStoredProofById } from "./proof-verification-service.js";
import { buildServer } from "./server.js";

async function createProofFixture() {
  const { client, db } = await openPgliteMemory();
  const email = `verify-${randomUUID()}@aproof.test`;
  const password = "verify_pw_123456";
  const su = await signUp(db, {
    email,
    password,
    organization_name: "Verify Org",
  });
  if (!su.ok) throw new Error("signUp failed");
  const { subject_id: subjectId } = await createSubject(db, {
    organizationId: su.organization_id,
    environmentId: su.environment_id,
    railType: "system",
  });
  const evt = await processEvent(db, {
    organization_id: su.organization_id,
    environment_id: su.environment_id,
    subject_id: subjectId,
    source_type_key: APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY,
    trace_id: `verify-trace-${randomUUID()}`,
    occurred_at: new Date("2026-01-01T00:00:00.000Z"),
    payload: cleanSystemControlPayload(),
  });
  if (!evt.ok) throw new Error("processEvent failed");
  const [firstProof] = await db
    .select({ proofId: proofUnits.proofId })
    .from(proofUnits)
    .where(eq(proofUnits.eventId, evt.event_id))
    .orderBy(asc(proofUnits.angle))
    .limit(1);
  if (!firstProof) throw new Error("proof row missing");
  return {
    client,
    db,
    orgId: su.organization_id,
    envId: su.environment_id,
    email,
    password,
    subjectId,
    eventId: evt.event_id,
    proofId: firstProof.proofId,
  };
}

describe("proof verification service", () => {
  it("returns valid when computed_root_hash matches anchored_root_hash", async () => {
    const fx = await createProofFixture();
    try {
      await runSandboxAnchorCoordinatorForSubject(fx.db, {
        subjectId: fx.subjectId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      const res = await verifyStoredProofById(fx.db, {
        proofId: fx.proofId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      expect(res).not.toBeNull();
      expect(res!.verification_status).toBe("valid");
      expect(res!.computed_root_hash).toBe(res!.anchored_root_hash);
      expect(res!.proof_digest).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await fx.client.close();
    }
  });

  it("returns invalid when computed and anchored root hashes differ", async () => {
    const fx = await createProofFixture();
    try {
      await runSandboxAnchorCoordinatorForSubject(fx.db, {
        subjectId: fx.subjectId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      const [proofRow] = await fx.db
        .select({ batchId: proofUnits.anchorBatchId })
        .from(proofUnits)
        .where(eq(proofUnits.proofId, fx.proofId))
        .limit(1);
      const batchId = proofRow?.batchId;
      expect(batchId).toBeTruthy();
      await fx.db
        .update(anchorBatches)
        .set({ rootHash: "deadbeef".repeat(8) })
        .where(eq(anchorBatches.id, batchId!));

      const res = await verifyStoredProofById(fx.db, {
        proofId: fx.proofId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      expect(res!.verification_status).toBe("invalid");
      expect(res!.mismatch_reason).toBe("ROOT_HASH_MISMATCH");
    } finally {
      await fx.client.close();
    }
  });

  it("returns explorer_url from persisted batch when normalizer would drop it (mode/classification mismatch)", async () => {
    const fx = await createProofFixture();
    try {
      await runSandboxAnchorCoordinatorForSubject(fx.db, {
        subjectId: fx.subjectId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      const [proofRow] = await fx.db
        .select({ batchId: proofUnits.anchorBatchId })
        .from(proofUnits)
        .where(eq(proofUnits.proofId, fx.proofId))
        .limit(1);
      const batchId = proofRow?.batchId;
      expect(batchId).toBeTruthy();

      const fakeExplorer = "https://explorer.solana.com/tx/unit-test-sig?cluster=devnet";
      await fx.db
        .update(anchorBatches)
        .set({
          anchorMode: "mock",
          explorerUrl: fakeExplorer,
          txSignature: "unit-test-sig",
        })
        .where(eq(anchorBatches.id, batchId!));

      const res = await verifyStoredProofById(fx.db, {
        proofId: fx.proofId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      expect(res).not.toBeNull();
      expect(res!.explorer_url).toBe(fakeExplorer);
    } finally {
      await fx.client.close();
    }
  });

  it("returns not_anchored when no anchor is present", async () => {
    const fx = await createProofFixture();
    try {
      const res = await verifyStoredProofById(fx.db, {
        proofId: fx.proofId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      expect(res!.verification_status).toBe("not_anchored");
      expect(res!.mismatch_reason).toBe("NO_ANCHOR_FOUND");
    } finally {
      await fx.client.close();
    }
  });

  it("returns error when batch recomputation cannot be performed", async () => {
    const fx = await createProofFixture();
    try {
      await runSandboxAnchorCoordinatorForSubject(fx.db, {
        subjectId: fx.subjectId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      const [proofRow] = await fx.db
        .select({ batchId: proofUnits.anchorBatchId })
        .from(proofUnits)
        .where(eq(proofUnits.proofId, fx.proofId))
        .limit(1);
      const batchId = proofRow?.batchId;
      expect(batchId).toBeTruthy();
      await fx.db.delete(anchorBatchItems).where(eq(anchorBatchItems.batchId, batchId!));

      const res = await verifyStoredProofById(fx.db, {
        proofId: fx.proofId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      expect(res!.verification_status).toBe("error");
      expect(res!.error_message).toBe("BATCH_RECOMPUTE_INPUT_MISSING");
    } finally {
      await fx.client.close();
    }
  });

  it("uses existing proof digest and batch hash utilities", async () => {
    const fx = await createProofFixture();
    try {
      await runSandboxAnchorCoordinatorForSubject(fx.db, {
        subjectId: fx.subjectId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      const [proofRow] = await fx.db
        .select({
          proofId: proofUnits.proofId,
          angle: proofUnits.angle,
          status: proofUnits.status,
          deltaCode: proofUnits.deltaCode,
          batchId: proofUnits.anchorBatchId,
        })
        .from(proofUnits)
        .where(eq(proofUnits.proofId, fx.proofId))
        .limit(1);
      const rows = await fx.db
        .select({
          proofId: proofUnits.proofId,
          angle: proofUnits.angle,
          status: proofUnits.status,
          deltaCode: proofUnits.deltaCode,
        })
        .from(anchorBatchItems)
        .innerJoin(proofUnits, eq(proofUnits.proofId, anchorBatchItems.proofId))
        .where(eq(anchorBatchItems.batchId, proofRow!.batchId!))
        .orderBy(asc(anchorBatchItems.ordinal));
      const expectedProofDigest = proofDigest({
        proof_id: proofRow!.proofId,
        angle: proofRow!.angle,
        status: proofRow!.status,
        delta_code: proofRow!.deltaCode,
      });
      const expectedRootHash = mvpAnchorBatchHashes(
        rows.map((r) =>
          proofDigest({
            proof_id: r.proofId,
            angle: r.angle,
            status: r.status,
            delta_code: r.deltaCode,
          }),
        ),
      ).rootHash;

      const res = await verifyStoredProofById(fx.db, {
        proofId: fx.proofId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      expect(res!.proof_digest).toBe(expectedProofDigest);
      expect(res!.computed_root_hash).toBe(expectedRootHash);
    } finally {
      await fx.client.close();
    }
  });

  it("maps legacy tx_ref through anchor metadata normalizer", async () => {
    const fx = await createProofFixture();
    try {
      await runSandboxAnchorCoordinatorForSubject(fx.db, {
        subjectId: fx.subjectId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      const [proofRow] = await fx.db
        .select({ batchId: proofUnits.anchorBatchId })
        .from(proofUnits)
        .where(eq(proofUnits.proofId, fx.proofId))
        .limit(1);
      const batchId = proofRow?.batchId;
      expect(batchId).toBeTruthy();
      await fx.db
        .update(anchorBatches)
        .set({ txSignature: null, txRef: "legacy-tx-ref-signature" })
        .where(eq(anchorBatches.id, batchId!));
      const res = await verifyStoredProofById(fx.db, {
        proofId: fx.proofId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      expect(res!.tx_signature).toBe("legacy-tx-ref-signature");
    } finally {
      await fx.client.close();
    }
  });
});

describe("GET /proofs/:id/verification", () => {
  it("returns stable verification response shape", async () => {
    const fx = await createProofFixture();
    try {
      await runSandboxAnchorCoordinatorForSubject(fx.db, {
        subjectId: fx.subjectId,
        organizationId: fx.orgId,
        environmentId: fx.envId,
      });
      const app = buildServer(fx.db);
      const sessionRes = await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email: fx.email, password: fx.password },
      });
      expect(sessionRes.statusCode).toBe(200);
      const setCookie = sessionRes.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const sessionCookie = cookieStr!.split(";")[0]!;

      const res = await app.inject({
        method: "GET",
        url: `/proofs/${fx.proofId}/verification`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(
        [
          "anchor_status",
          "anchored_root_hash",
          "batch_id",
          "computed_root_hash",
          "error_message",
          "event_id",
          "explorer_url",
          "mismatch_reason",
          "network",
          "proof_digest",
          "proof_id",
          "subject_id",
          "tx_signature",
          "verification_status",
          "verified_at",
        ].sort(),
      );
      await app.close();
    } finally {
      await fx.client.close();
    }
  });
});
