import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import { createDb, type Db } from "../src/db/client.js";
import { buildServer } from "../src/http/server.js";
import {
  apiKeys,
  baselines,
  canonicalEvents,
  environments,
  failureLocatorRecords,
  mappingRules,
  organizations,
  proofUnits,
  subjects,
} from "../src/db/schema/index.js";

const e2eUrl = process.env.E2E_DATABASE_URL?.trim();

async function closeDb(db: Db) {
  if (db.$client instanceof Pool) {
    await db.$client.end();
  } else {
    await db.$client.close();
  }
}

function reason(res: { json(): unknown }): string | undefined {
  const b = res.json() as { error?: { details?: { reason?: string } } };
  return b.error?.details?.reason;
}

describe("e2e: backend hardening", () => {
  let db: Db;
  let app: FastifyInstance;
  let apiKeyPlain: string;
  let orgId: string;
  let envId: string;
  let subjectId: string;

  beforeAll(async () => {
    if (e2eUrl) {
      db = createDb(e2eUrl);
    } else {
      const { openPgliteMemory } = await import("../src/db/pglite.js");
      db = (await openPgliteMemory()).db;
    }

    orgId = randomUUID();
    envId = randomUUID();
    subjectId = randomUUID();
    apiKeyPlain = `hard_${randomUUID()}`;
    const keyHash = createHash("sha256").update(apiKeyPlain, "utf8").digest("hex");

    await db.insert(organizations).values({ id: orgId, name: "hardening-org" });
    await db.insert(environments).values({ id: envId, organizationId: orgId, name: "hardening-env" });
    await db.insert(subjects).values({
      id: subjectId,
      organizationId: orgId,
      environmentId: envId,
      railType: "service",
      externalKey: `subj-${subjectId.slice(0, 8)}`,
    });
    await db.insert(apiKeys).values({
      organizationId: orgId,
      environmentId: envId,
      name: "hard",
      keyPrefix: apiKeyPlain.slice(0, 8),
      keyHash,
    });
    await db.insert(mappingRules).values([
      {
        organizationId: orgId,
        environmentId: envId,
        sourceTypeKey: "e2e.strict_xray",
        canonicalEventType: "action_completed",
        isActive: true,
      },
      {
        organizationId: orgId,
        environmentId: envId,
        sourceTypeKey: "e2e.generic",
        canonicalEventType: "action_completed",
        isActive: true,
      },
      {
        organizationId: orgId,
        environmentId: envId,
        sourceTypeKey: "e2e.compat.upload",
        canonicalEventType: "action_completed",
        isActive: true,
      },
      {
        organizationId: orgId,
        environmentId: envId,
        sourceTypeKey: "e2e.compat.analysis",
        canonicalEventType: "action_completed",
        isActive: true,
      },
      {
        organizationId: orgId,
        environmentId: envId,
        sourceTypeKey: "e2e.noncompat.analysis",
        canonicalEventType: "action_completed",
        isActive: true,
      },
    ]);
    await db.insert(baselines).values({
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "deterministic_integrity",
      version: 1,
      definition: {
        type: "deterministic_integrity_v1",
        expected_digest: "abc123",
        algorithm: "sha256",
        require_exact_match: true,
      },
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      effectiveTo: null,
    });

    app = buildServer(db);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeDb(db);
  });

  it("A/B/C: stable artifact identity and lineage progression behavior", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        trace_id: "hard-a-1",
        occurred_at: "2026-04-10T00:00:00.000Z",
        payload: { xray_id: "XR-HARD-1", analysis: "v1", deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json() as { event_id: string };

    const changedState = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        trace_id: "hard-a-2",
        occurred_at: "2026-04-10T00:01:00.000Z",
        payload: { xray_id: "XR-HARD-1", analysis: "v2", deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(changedState.statusCode).toBe(201);
    const secondBody = changedState.json() as { event_id: string };

    const duplicateState = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        trace_id: "hard-a-3",
        occurred_at: "2026-04-10T00:02:00.000Z",
        payload: { xray_id: "XR-HARD-1", analysis: "v2", deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(duplicateState.statusCode).toBe(422);
    expect(reason(duplicateState)).toBe("duplicate_lineage_version_same_hash");

    const thirdArtifact = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        trace_id: "hard-a-4",
        occurred_at: "2026-04-10T00:03:00.000Z",
        payload: { xray_id: "XR-HARD-2", analysis: "v1", deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(thirdArtifact.statusCode).toBe(201);
    const thirdBody = thirdArtifact.json() as { event_id: string };

    const rows = await db
      .select({
        eventId: canonicalEvents.eventId,
        artifactId: canonicalEvents.artifactId,
        lineageId: canonicalEvents.eventLineageId,
        version: canonicalEvents.eventVersion,
      })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.organizationId, orgId));
    const r1 = rows.find((r) => r.eventId === firstBody.event_id)!;
    const r2 = rows.find((r) => r.eventId === secondBody.event_id)!;
    const r3 = rows.find((r) => r.eventId === thirdBody.event_id)!;
    expect(r1.artifactId).toBe(r2.artifactId);
    expect(r1.lineageId).toBe(r2.lineageId);
    expect(r2.version).toBeGreaterThan(r1.version);
    expect(r3.artifactId).not.toBe(r1.artifactId);
  });

  it("D/E/F/G: generic derivation, insufficient identity, and lineage/artifact conflicts", async () => {
    const generic1 = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.generic",
        subject_id: subjectId,
        trace_id: "hard-g-1",
        occurred_at: "2026-04-10T00:10:00.000Z",
        payload: { record_id: "REC-1", mutable: "a", deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(generic1.statusCode).toBe(201);

    const generic2 = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.generic",
        subject_id: subjectId,
        trace_id: "hard-g-2",
        occurred_at: "2026-04-10T00:11:00.000Z",
        payload: { record_id: "REC-1", mutable: "b", deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(generic2.statusCode).toBe(201);

    const insufficient = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.generic",
        subject_id: subjectId,
        trace_id: "hard-g-3",
        occurred_at: "2026-04-10T00:12:00.000Z",
        payload: { mutable: "only" },
      },
    });
    expect(insufficient.statusCode).toBe(422);
    expect(reason(insufficient)).toBe("ARTIFACT_IDENTITY_INSUFFICIENT");

    const conflict = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        artifact_id: randomUUID(),
        trace_id: "hard-g-4",
        occurred_at: "2026-04-10T00:13:00.000Z",
        payload: { xray_id: "XR-CONFLICT", deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(conflict.statusCode).toBe(422);
    expect(reason(conflict)).toBe("ARTIFACT_ID_CONFLICT_WITH_DERIVED");

    const lineageId = randomUUID();
    const a = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        event_lineage_id: lineageId,
        event_version: 1,
        trace_id: "hard-g-5",
        occurred_at: "2026-04-10T00:14:00.000Z",
        payload: { xray_id: "XR-LINE-A", deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(a.statusCode).toBe(201);

    const b = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        event_lineage_id: lineageId,
        event_version: 2,
        trace_id: "hard-g-6",
        occurred_at: "2026-04-10T00:15:00.000Z",
        payload: { xray_id: "XR-LINE-B", deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(b.statusCode).toBe(422);
    expect(reason(b)).toBe("LINEAGE_ARTIFACT_IDENTITY_CONFLICT");
  });

  it("H/I/J: failure persistence, evidence records, and pipeline stages are explicit", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.strict_xray",
        subject_id: subjectId,
        trace_id: "hard-hij",
        occurred_at: "2026-04-10T00:20:00.000Z",
        payload: { xray_id: "XR-FAIL-1", deterministic: { observed_digest: "zzz999" } },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      event_id: string;
      raw_event_id: string;
      product_proof: { angles: Array<{ evidence_refs: string[] }>; event_lineage_id: string; artifact_id: string };
    };

    const [ce] = await db
      .select({
        eventId: canonicalEvents.eventId,
        pipelineStageJson: canonicalEvents.pipelineStageJson,
        artifactIdentitySource: canonicalEvents.artifactIdentitySource,
      })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.eventId, body.event_id))
      .limit(1);
    expect(ce?.artifactIdentitySource).toBeTruthy();
    expect(ce?.pipelineStageJson).toEqual({
      raw_ingested: true,
      canonicalized: true,
      identity_resolved: true,
      baseline_resolved: true,
      angles_evaluated: true,
      proof_built: true,
      anchorable: true,
    });

    const unitRows = await db
      .select({
        proofId: proofUnits.proofId,
        evidenceJson: proofUnits.evidenceJson,
        rawEventId: proofUnits.rawEventId,
        eventLineageId: proofUnits.eventLineageId,
        artifactId: proofUnits.artifactId,
      })
      .from(proofUnits)
      .where(eq(proofUnits.eventId, body.event_id));
    expect(unitRows.length).toBeGreaterThan(0);
    const anyEvidence = unitRows.find((u) => {
      const e = u.evidenceJson as { evidence_records?: Array<{ kind?: string }> } | null;
      return Array.isArray(e?.evidence_records) && e.evidence_records.length > 0;
    });
    expect(anyEvidence).toBeTruthy();
    expect(anyEvidence?.rawEventId).toBe(body.raw_event_id);
    expect(anyEvidence?.artifactId).toBe(body.product_proof.artifact_id);

    const proofAngleEvidenceRefs = body.product_proof.angles.flatMap((a) => a.evidence_refs);
    expect(proofAngleEvidenceRefs.some((r) => r.startsWith("ev_"))).toBe(true);

    const failureRows = await db
      .select({
        proofId: failureLocatorRecords.proofId,
        eventId: failureLocatorRecords.eventId,
        canonicalEventId: failureLocatorRecords.canonicalEventId,
        eventLineageId: failureLocatorRecords.eventLineageId,
        artifactId: failureLocatorRecords.artifactId,
        reasonCode: failureLocatorRecords.reasonCode,
      })
      .from(failureLocatorRecords)
      .where(and(eq(failureLocatorRecords.eventId, body.event_id), eq(failureLocatorRecords.rawEventId, body.raw_event_id)));
    expect(failureRows.length).toBeGreaterThan(0);
    expect(failureRows[0]?.canonicalEventId).toBe(body.event_id);
    expect(failureRows[0]?.eventLineageId).toBe(body.product_proof.event_lineage_id);
    expect(failureRows[0]?.artifactId).toBe(body.product_proof.artifact_id);
    expect(failureRows[0]?.reasonCode).toBeTruthy();
  });

  it("cross-source compatibility and normalization hardening", async () => {
    const upload = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.compat.upload",
        subject_id: subjectId,
        trace_id: "hard-xsrc-1",
        occurred_at: "2026-04-10T01:00:00.000Z",
        payload: { image_id: "IMG-CROSS-1", deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(upload.statusCode).toBe(201);
    const uploadId = (upload.json() as { event_id: string }).event_id;

    const analysisSameState = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.compat.analysis",
        subject_id: subjectId,
        trace_id: "hard-xsrc-2",
        occurred_at: "2026-04-10T01:01:00.000Z",
        payload: { image_id: "IMG-CROSS-1", deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(analysisSameState.statusCode).toBe(422);
    expect(reason(analysisSameState)).toBe("duplicate_lineage_version_same_hash");

    const analysisNewState = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.compat.analysis",
        subject_id: subjectId,
        trace_id: "hard-xsrc-3",
        occurred_at: "2026-04-10T01:02:00.000Z",
        payload: { image: { uid: "img-cross-1" }, deterministic: { observed_digest: "different-state" } },
      },
    });
    expect(analysisNewState.statusCode).toBe(201);
    const analysisId = (analysisNewState.json() as { event_id: string }).event_id;

    const nonCompat = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.noncompat.analysis",
        subject_id: subjectId,
        trace_id: "hard-xsrc-4",
        occurred_at: "2026-04-10T01:03:00.000Z",
        payload: { image: { uid: "img-cross-1" }, deterministic: { observed_digest: "abc123" } },
      },
    });
    expect(nonCompat.statusCode).toBe(201);
    const nonCompatId = (nonCompat.json() as { event_id: string }).event_id;

    const conflictIds = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.compat.analysis",
        subject_id: subjectId,
        trace_id: "hard-xsrc-5",
        occurred_at: "2026-04-10T01:04:00.000Z",
        payload: {
          image_id: "img-conflict-a",
          image: { uid: "img-conflict-b" },
          deterministic: { observed_digest: "abc123" },
        },
      },
    });
    expect(conflictIds.statusCode).toBe(422);
    expect(reason(conflictIds)).toBe("ARTIFACT_STABLE_IDENTITY_CONFLICT");

    const rows = await db
      .select({
        eventId: canonicalEvents.eventId,
        artifactId: canonicalEvents.artifactId,
        lineageId: canonicalEvents.eventLineageId,
        version: canonicalEvents.eventVersion,
        sourceTypeKey: canonicalEvents.sourceTypeKey,
        quality: canonicalEvents.artifactIdentityQuality,
        compatibleSource: canonicalEvents.artifactIdentityCompatibleSourceMatch,
      })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.organizationId, orgId));

    const uploadRow = rows.find((r) => r.eventId === uploadId)!;
    const analysisRow = rows.find((r) => r.eventId === analysisId)!;
    const nonCompatRow = rows.find((r) => r.eventId === nonCompatId)!;

    expect(uploadRow.artifactId).toBe(analysisRow.artifactId);
    expect(uploadRow.lineageId).toBe(analysisRow.lineageId);
    expect(analysisRow.version).toBeGreaterThan(uploadRow.version);
    expect(nonCompatRow.artifactId).not.toBe(uploadRow.artifactId);
    expect(analysisRow.quality).toBeTruthy();
    expect(analysisRow.compatibleSource === null || typeof analysisRow.compatibleSource === "string").toBe(true);
  });

  it("rejects when multiple compatible candidates match the same stable identity", async () => {
    const basePayload = { record_id: "REC-AMB-1", deterministic: { observed_digest: "abc123" } };
    const seededA = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.compat.analysis",
        subject_id: subjectId,
        artifact_id: randomUUID(),
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "hard-amb-1",
        occurred_at: "2026-04-10T01:10:00.000Z",
        payload: basePayload,
      },
    });
    expect(seededA.statusCode).toBe(201);

    const seededB = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.compat.analysis",
        subject_id: subjectId,
        artifact_id: randomUUID(),
        event_lineage_id: randomUUID(),
        event_version: 1,
        trace_id: "hard-amb-2",
        occurred_at: "2026-04-10T01:11:00.000Z",
        payload: basePayload,
      },
    });
    expect(seededB.statusCode).toBe(201);

    const incoming = await app.inject({
      method: "POST",
      url: "/events",
      headers: { "x-api-key": apiKeyPlain, "content-type": "application/json" },
      payload: {
        organization_id: orgId,
        environment_id: envId,
        source_type_key: "e2e.compat.analysis",
        subject_id: subjectId,
        trace_id: "hard-amb-3",
        occurred_at: "2026-04-10T01:12:00.000Z",
        payload: basePayload,
      },
    });
    expect(incoming.statusCode).toBe(422);
    expect(reason(incoming)).toBe("LINEAGE_AMBIGUOUS_ARTIFACT_IDENTITY");
  });
});

