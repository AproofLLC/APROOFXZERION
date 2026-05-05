import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openPgliteMemory } from "../db/pglite.js";
import { runSandboxAnchorCoordinatorForSubject } from "../anchor/sandbox-anchor-coordinator.js";
import { formatSandboxAnchorPayload, SOLANA_SANDBOX_ROUTE } from "../anchor/sandbox-anchor-constants.js";
import { signUp } from "./auth-session.js";
import { processEvent } from "../pipeline/process-event.js";
import { APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY, createSubject } from "./subject-service.js";
import { cleanSystemControlPayload } from "../demo/demo-clean-payloads.js";
import { getIntegrationStatus } from "./integration-read-service.js";

describe("integration read (solana-sandbox anchor readout)", () => {
  it("exposes solana-sandbox route, simulated fields, and honest external_attested on integration-status", async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const email = `int-sol-${randomUUID()}@aproof.test`;
      const su = await signUp(db, {
        email,
        password: "int_sol_test_pw_123456",
        organization_name: "Int Sol",
      });
      if (!su.ok) throw new Error("signUp failed");
      const { organization_id: orgId, environment_id: envId } = su;
      const { subject_id: subjectId } = await createSubject(db, {
        organizationId: orgId,
        environmentId: envId,
        railType: "system",
      });

      const r = await processEvent(db, {
        organization_id: orgId,
        environment_id: envId,
        subject_id: subjectId,
        source_type_key: APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY,
        trace_id: "int-sol-trace",
        occurred_at: new Date("2020-01-15T10:00:00.000Z"),
        payload: cleanSystemControlPayload(),
      });
      if (!r.ok) throw new Error("processEvent failed");

      await runSandboxAnchorCoordinatorForSubject(db, { subjectId, organizationId: orgId, environmentId: envId });

      const st = await getIntegrationStatus(db, { subjectId, organizationId: orgId, environmentId: envId });
      expect(st).not.toBeNull();
      const ar = st!.anchor_readout;
      expect(ar.default_chain_name).toBe(SOLANA_SANDBOX_ROUTE);
      expect(ar.route).toBe(SOLANA_SANDBOX_ROUTE);
      expect(ar.network_family).toBe("Solana");
      expect(ar.cluster).toBe("sandbox-devnet");
      const desc = ar.mvp_policy.description.toLowerCase();
      expect(desc).not.toContain("anchored on solana devnet");
      expect(desc).toContain("not a real solana devnet");

      const lb = ar.latest_batch;
      expect(lb).not.toBeNull();
      expect(lb!.chain_name).toBe(SOLANA_SANDBOX_ROUTE);
      expect(lb!.anchor_payload).toBe(formatSandboxAnchorPayload(lb!.batch_hash));
      expect(lb!.anchor_payload).toMatch(/^aproof:v1:[a-f0-9]+$/);
      expect(lb!.simulated_signature).toMatch(/^ssim1_[a-f0-9]{64}$/);
      expect(lb!.simulated_slot).toMatch(/^\d+$/);
      expect(lb!.external_attested).toBe(false);
      expect(lb!.anchor_metadata).toBeDefined();
      expect(lb!.anchor_metadata.batch_id).toBe(lb!.batch_id);
      expect(Array.isArray(lb!.anchor_metadata.proof_ids)).toBe(true);
    } finally {
      await client.close();
    }
  }, 30_000);
});
