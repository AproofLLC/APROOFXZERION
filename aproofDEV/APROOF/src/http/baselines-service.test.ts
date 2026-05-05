import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openPgliteMemory } from "../db/pglite.js";
import { baselines, environments, organizations, subjects } from "../db/schema/index.js";
import { listBaselinesForSubject } from "./baselines-service.js";

describe("baselines-service contract", () => {
  it("listBaselinesForSubject uses null last_updated when no baseline row exists for an angle", async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const orgId = randomUUID();
      const envId = randomUUID();
      const subjectId = randomUUID();
      await db.insert(organizations).values({ id: orgId, name: "t-org" });
      await db.insert(environments).values({ id: envId, organizationId: orgId, name: "t-env" });
      await db.insert(subjects).values({
        id: subjectId,
        organizationId: orgId,
        environmentId: envId,
        railType: "model",
      });
      await db.insert(baselines).values({
        organizationId: orgId,
        environmentId: envId,
        subjectId,
        angle: "policy_integrity",
        version: 1,
        definition: {},
        effectiveFrom: new Date(),
      });

      const rows = await listBaselinesForSubject(db, {
        subjectId,
        organizationId: orgId,
        environmentId: envId,
      });
      const policy = rows.find((r) => r.angle === "policy_integrity");
      const missing = rows.find((r) => r.angle === "deterministic_integrity");
      expect(policy?.last_updated).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(missing?.last_updated).toBeNull();
      expect(missing?.baseline_summary).toBe("No baseline row (repair by saving from UI)");
      expect(missing?.enabled).toBe(true);
    } finally {
      await client.close();
    }
  });
});
