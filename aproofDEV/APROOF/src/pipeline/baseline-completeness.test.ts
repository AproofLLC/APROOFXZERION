/// <reference path="../vitest-test-globals.d.ts" />
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPgliteMemory } from "../db/pglite.js";
import { baselines, environments, organizations, subjects } from "../db/schema/index.js";

const EXPECTED_ACTIVE_IMPLEMENTED_ANGLES = [
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
] as const;

describe("baseline completeness", () => {
  let db: Awaited<ReturnType<typeof openPgliteMemory>>["db"];
  let client: Awaited<ReturnType<typeof openPgliteMemory>>["client"];
  let orgId: string;
  let envId: string;

  async function insertBaselineSetForSubject(subjectId: string) {
    await db.insert(baselines).values([
      {
        organizationId: orgId,
        environmentId: envId,
        subjectId,
        angle: "policy_integrity",
        version: 1,
        definition: {
          type: "policy_integrity_v1",
          required_rules: ["allow_read"],
        },
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        effectiveTo: null,
      },
      {
        organizationId: orgId,
        environmentId: envId,
        subjectId,
        angle: "identity_access_integrity",
        version: 1,
        definition: {
          type: "identity_access_integrity_v1",
          required_scopes: ["read:proofs"],
          expected_tenant_id: "tenant_a",
          require_access_log: true,
        },
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        effectiveTo: null,
      },
      {
        organizationId: orgId,
        environmentId: envId,
        subjectId,
        angle: "operational_integrity",
        version: 1,
        definition: {
          type: "operational_integrity_v1",
          expected_status: "success",
          max_latency_ms: 2000,
          require_no_runtime_error: true,
        },
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        effectiveTo: null,
      },
      {
        organizationId: orgId,
        environmentId: envId,
        subjectId,
        angle: "model_identity_integrity",
        version: 1,
        definition: {
          type: "model_identity_integrity_v1",
          expected_model: "gpt-4.1-mini",
          require_exact_match: true,
        },
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        effectiveTo: null,
      },
      {
        organizationId: orgId,
        environmentId: envId,
        subjectId,
        angle: "retrieval_integrity",
        version: 1,
        definition: {
          type: "retrieval_integrity_v1",
          expected_sources: ["db", "cache"],
          min_sources: 2,
        },
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        effectiveTo: null,
      },
      {
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
      },
      {
        organizationId: orgId,
        environmentId: envId,
        subjectId,
        angle: "cross_system_integrity",
        version: 1,
        definition: {
          type: "cross_system_integrity_v1",
          expected_systems: ["crm", "billing"],
          require_all_systems: true,
        },
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        effectiveTo: null,
      },
    ]);
  }

  async function angleSetForSubject(subjectId: string): Promise<Set<string>> {
    const rows = await db
      .select({ angle: baselines.angle })
      .from(baselines)
      .where(
        and(
          eq(baselines.organizationId, orgId),
          eq(baselines.environmentId, envId),
          eq(baselines.subjectId, subjectId)
        )
      );
    return new Set(rows.map((r) => r.angle));
  }

  beforeAll(async () => {
    const opened = await openPgliteMemory();
    db = opened.db;
    client = opened.client;

    orgId = randomUUID();
    envId = randomUUID();
    await db.insert(organizations).values({ id: orgId, name: "baseline-completeness-org" });
    await db.insert(environments).values({ id: envId, organizationId: orgId, name: "baseline-completeness-env" });
  });

  afterAll(async () => {
    await client.close();
  });

  it("baseline contains all active implemented angles", async () => {
    const subjectId = randomUUID();
    await db.insert(subjects).values({
      id: subjectId,
      organizationId: orgId,
      environmentId: envId,
      railType: "service",
      externalKey: "baseline-complete-subject-1",
    });

    await insertBaselineSetForSubject(subjectId);
    const found = await angleSetForSubject(subjectId);

    for (const angle of EXPECTED_ACTIVE_IMPLEMENTED_ANGLES) {
      expect(found.has(angle)).toBe(true);
    }
  });

  it("baseline completeness list matches active action/retrieval implemented angles", async () => {
    const subjectId = randomUUID();
    await db.insert(subjects).values({
      id: subjectId,
      organizationId: orgId,
      environmentId: envId,
      railType: "service",
      externalKey: "baseline-complete-subject-2",
    });

    await insertBaselineSetForSubject(subjectId);
    const found = await angleSetForSubject(subjectId);
    expect(found).toEqual(new Set(EXPECTED_ACTIVE_IMPLEMENTED_ANGLES));
  });
});
