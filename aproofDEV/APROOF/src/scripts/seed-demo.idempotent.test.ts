/// <reference path="../vitest-test-globals.d.ts" />
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { apiKeys, baselines, environments, mappingRules, organizations, subjects } from "../db/schema/index.js";
import { DEMO, ensureDemoTenant } from "./seed-demo.js";

describe("ensureDemoTenant idempotency", () => {
  it("second run does not duplicate org, env, demo subject, mapping, baseline, or API key hash", async () => {
    const { openPgliteMemory } = await import("../db/pglite.js");
    const { client, db } = await openPgliteMemory();
    const keyHash = createHash("sha256").update(DEMO.apiKeyPlain, "utf8").digest("hex");
    try {
      await ensureDemoTenant(db);
      await ensureDemoTenant(db);

      const orgCount = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, DEMO.orgId));
      expect(orgCount.length).toBe(1);

      const envCount = await db
        .select({ id: environments.id })
        .from(environments)
        .where(eq(environments.id, DEMO.envId));
      expect(envCount.length).toBe(1);

      const subCount = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(eq(subjects.id, DEMO.subjectId));
      expect(subCount.length).toBe(1);

      const mapCount = await db
        .select({ id: mappingRules.id })
        .from(mappingRules)
        .where(
          and(
            eq(mappingRules.organizationId, DEMO.orgId),
            eq(mappingRules.environmentId, DEMO.envId),
            eq(mappingRules.sourceTypeKey, "demo.policy_checked")
          )
        );
      expect(mapCount.length).toBe(1);

      const baseCount = await db
        .select({ id: baselines.id })
        .from(baselines)
        .where(
          and(
            eq(baselines.subjectId, DEMO.subjectId),
            eq(baselines.angle, "policy_integrity"),
            eq(baselines.version, 1)
          )
        );
      expect(baseCount.length).toBe(1);

      const keyRows = await db
        .select({ id: apiKeys.id })
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash));
      expect(keyRows.length).toBe(1);
    } finally {
      await client.close();
    }
  });
});
