import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signUp } from "./auth-session.js";
import { openPgliteMemory } from "../db/pglite.js";
import { buildSubjectOverview } from "./overview-read-model.js";
import { cleanSystemControlPayload } from "../demo/demo-clean-payloads.js";
import { processEvent } from "../pipeline/process-event.js";
import { createSubject, APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY } from "./subject-service.js";
import { runSandboxScenario } from "./sandbox-scenario-runner.js";
import type { SubjectOverview } from "./overview-read-model.js";

function overviewStructuralKeys(ov: SubjectOverview): string[] {
  const keys = (o: unknown): string[] => {
    if (o === null || typeof o !== "object") return [];
    if (Array.isArray(o)) {
      return o.flatMap((item) => keys(item));
    }
    return Object.keys(o as Record<string, unknown>).sort();
  };
  return [...new Set(keys(ov))].sort();
}

describe("sandbox scenario parity", () => {
  it(
    "clean_first_proof overview shape matches a normal system subject with the same ingest path",
    async () => {
      const { client, db } = await openPgliteMemory();
      try {
        const email = `parity-${randomUUID()}@aproof.test`;
        const su = await signUp(db, {
          email,
          password: "parity_pw_123456",
          organization_name: "Parity Org",
        });
        if (!su.ok) throw new Error("signUp failed");
        const { organization_id: orgId, environment_id: envId } = su;

        const normalSubject = await createSubject(db, {
          organizationId: orgId,
          environmentId: envId,
          railType: "system",
        });
        const ingestResult = await processEvent(db, {
          organization_id: orgId,
          environment_id: envId,
          subject_id: normalSubject.subject_id,
          source_type_key: APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY,
          trace_id: "parity-normal-trace",
          occurred_at: new Date("2020-06-01T12:00:00.000Z"),
          payload: cleanSystemControlPayload(),
        });
        expect(ingestResult.ok).toBe(true);

        const { primary_subject_id: sandboxSubjectId } = await runSandboxScenario(db, {
          organizationId: orgId,
          environmentId: envId,
          template: "clean_first_proof",
        });

        const ovNormal = await buildSubjectOverview(db, {
          subjectId: normalSubject.subject_id,
          organizationId: orgId,
          environmentId: envId,
          environmentName: "testnet",
        });
        const ovSandbox = await buildSubjectOverview(db, {
          subjectId: sandboxSubjectId,
          organizationId: orgId,
          environmentId: envId,
          environmentName: "testnet",
        });

        expect(ovNormal).not.toBeNull();
        expect(ovSandbox).not.toBeNull();
        expect(overviewStructuralKeys(ovNormal!)).toEqual(overviewStructuralKeys(ovSandbox!));
      } finally {
        await client.close();
      }
    },
    30_000,
  );
});
