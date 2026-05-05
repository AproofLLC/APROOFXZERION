/// <reference path="../vitest-test-globals.d.ts" />
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPgliteMemory } from "../db/pglite.js";
import {
  baselines,
  environments,
  organizations,
  subjects,
  type integrityAngleEnum,
} from "../db/schema/index.js";
import { resolveBaselineAt } from "./baseline-resolve.js";

type IntegrityAngle = (typeof integrityAngleEnum.enumValues)[number];

describe("resolveBaselineAt baseline versioning", () => {
  let db: Awaited<ReturnType<typeof openPgliteMemory>>["db"];
  let client: Awaited<ReturnType<typeof openPgliteMemory>>["client"];
  let orgId: string;
  let envId: string;
  let subjectId: string;

  beforeAll(async () => {
    const opened = await openPgliteMemory();
    db = opened.db;
    client = opened.client;

    orgId = randomUUID();
    envId = randomUUID();
    subjectId = randomUUID();

    await db.insert(organizations).values({ id: orgId, name: "baseline-versioning-org" });
    await db.insert(environments).values({ id: envId, organizationId: orgId, name: "baseline-versioning-env" });
    await db.insert(subjects).values({
      id: subjectId,
      organizationId: orgId,
      environmentId: envId,
      railType: "service",
      externalKey: "baseline-versioning-subject",
    });
  });

  afterAll(async () => {
    await client.close();
  });

  it("selects v1 before switch and v2 after switch for a single angle", async () => {
    await db.insert(baselines).values([
      {
        organizationId: orgId,
        environmentId: envId,
        subjectId,
        angle: "model_identity_integrity",
        version: 1,
        definition: {
          type: "model_identity_integrity_v1",
          version: 1,
          effective_from: "2020-01-01T00:00:00.000Z",
          expected_model: "gpt-4.1-mini",
          require_exact_match: true,
        },
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2024-01-01T00:00:00.000Z"),
      },
      {
        organizationId: orgId,
        environmentId: envId,
        subjectId,
        angle: "model_identity_integrity",
        version: 2,
        definition: {
          type: "model_identity_integrity_v1",
          version: 2,
          effective_from: "2024-01-01T00:00:00.000Z",
          expected_model: "gpt-4.1-mini",
          require_exact_match: true,
        },
        effectiveFrom: new Date("2024-01-01T00:00:00.000Z"),
        effectiveTo: null,
      },
    ]);

    const v1 = await resolveBaselineAt(db, {
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "model_identity_integrity",
      at: new Date("2023-06-01T00:00:00.000Z"),
    });
    expect(v1?.version).toBe(1);

    const v2 = await resolveBaselineAt(db, {
      organizationId: orgId,
      environmentId: envId,
      subjectId,
      angle: "model_identity_integrity",
      at: new Date("2025-06-01T00:00:00.000Z"),
    });
    expect(v2?.version).toBe(2);
  });

  it("selects the correct manual baseline version per timestamp for all seven angles", async () => {
    const subjectIdAllAngles = randomUUID();
    await db.insert(subjects).values({
      id: subjectIdAllAngles,
      organizationId: orgId,
      environmentId: envId,
      railType: "service",
      externalKey: "baseline-versioning-all-angles-subject",
    });

    const allAngles: readonly IntegrityAngle[] = [
      "deterministic_integrity",
      "model_identity_integrity",
      "retrieval_integrity",
      "policy_integrity",
      "operational_integrity",
      "identity_access_integrity",
      "cross_system_integrity",
    ];

    const rows = allAngles.flatMap((angle) => [
      {
        organizationId: orgId,
        environmentId: envId,
        subjectId: subjectIdAllAngles,
        angle,
        version: 1,
        definition: {
          type: `${angle}_v1`,
          version: 1,
          effective_from: "2020-01-01T00:00:00.000Z",
          rules: { manual: true },
        },
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2024-01-01T00:00:00.000Z"),
      },
      {
        organizationId: orgId,
        environmentId: envId,
        subjectId: subjectIdAllAngles,
        angle,
        version: 2,
        definition: {
          type: `${angle}_v2`,
          version: 2,
          effective_from: "2024-01-01T00:00:00.000Z",
          rules: { manual: true },
        },
        effectiveFrom: new Date("2024-01-01T00:00:00.000Z"),
        effectiveTo: null,
      },
    ]);
    await db.insert(baselines).values(rows);

    for (const angle of allAngles) {
      const beforeSwitch = await resolveBaselineAt(db, {
        organizationId: orgId,
        environmentId: envId,
        subjectId: subjectIdAllAngles,
        angle,
        at: new Date("2023-01-01T00:00:00.000Z"),
      });
      expect(beforeSwitch?.version).toBe(1);

      const afterSwitch = await resolveBaselineAt(db, {
        organizationId: orgId,
        environmentId: envId,
        subjectId: subjectIdAllAngles,
        angle,
        at: new Date("2025-01-01T00:00:00.000Z"),
      });
      expect(afterSwitch?.version).toBe(2);
    }
  });
});
