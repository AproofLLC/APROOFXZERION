import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { openPgliteMemory } from "../db/pglite.js";
import { proofUnits } from "../db/schema/index.js";
import { signUp } from "./auth-session.js";
import { APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY, createSubject } from "./subject-service.js";
import { processEvent } from "../pipeline/process-event.js";
import { cleanSystemControlPayload } from "../demo/demo-clean-payloads.js";
import { runSandboxAnchorCoordinatorForSubject } from "../anchor/sandbox-anchor-coordinator.js";
import { getLineageDetail } from "./lineage-read-service.js";

describe("lineage read anchor metadata", () => {
  it("returns canonical anchor_metadata in anchor_mapping", async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const su = await signUp(db, {
        email: `lineage-anch-${randomUUID()}@aproof.test`,
        password: "lineage_anchor_pw_123456",
        organization_name: "Lineage Anchor Org",
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
        trace_id: "lineage-anchor-trace",
        occurred_at: new Date("2026-01-01T00:00:00.000Z"),
        payload: cleanSystemControlPayload(),
      });
      if (!r.ok) throw new Error("processEvent failed");
      await runSandboxAnchorCoordinatorForSubject(db, {
        subjectId,
        organizationId: orgId,
        environmentId: envId,
      });
      const detail = await getLineageDetail(db, {
        lineageId: r.lineage.event_lineage_id,
        organizationId: orgId,
        environmentId: envId,
      });
      expect(detail).not.toBeNull();
      expect(detail!.anchor_mapping.length).toBeGreaterThan(0);
      expect(detail!.anchor_mapping[0]!.anchor_metadata).toBeDefined();
      expect(Array.isArray(detail!.anchor_mapping[0]!.anchor_metadata.proof_ids)).toBe(true);

      const [pol] = await db
        .select({ proofId: proofUnits.proofId, anchorBatchId: proofUnits.anchorBatchId })
        .from(proofUnits)
        .where(and(eq(proofUnits.eventId, r.event_id), eq(proofUnits.angle, "policy_integrity")))
        .limit(1);
      expect(pol).toBeDefined();
      expect(detail!.version_timeline[0]!.proof_id).toBe(pol!.proofId);
      expect(detail!.anchor_mapping[0]!.anchor_batch_id).toBe(pol!.anchorBatchId);
    } finally {
      await client.close();
    }
  });
});
