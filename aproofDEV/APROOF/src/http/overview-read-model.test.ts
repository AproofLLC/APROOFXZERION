import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { openPgliteMemory } from "../db/pglite.js";
import { environments, organizations, subjects } from "../db/schema/index.js";
import {
  buildSubjectOverview,
  OverviewBuildFailedError,
  safeIsoTimestamp,
} from "./overview-read-model.js";
import * as subjectService from "./subject-service.js";

describe("overview-read-model", () => {
  it("safeIsoTimestamp handles Date, string, and null-like values", () => {
    const d = new Date("2024-06-01T12:00:00.000Z");
    expect(safeIsoTimestamp(d)).toBe(d.toISOString());
    expect(safeIsoTimestamp("2024-06-01T12:00:00.000Z")).toBe(
      new Date("2024-06-01T12:00:00.000Z").toISOString(),
    );
    expect(safeIsoTimestamp(null)).toBe(new Date(0).toISOString());
    expect(safeIsoTimestamp(undefined)).toBe(new Date(0).toISOString());
  });

  it("buildSubjectOverview returns null when subject is missing", async () => {
    const { client, db } = await openPgliteMemory();
    try {
      const out = await buildSubjectOverview(db, {
        subjectId: randomUUID(),
        organizationId: randomUUID(),
        environmentId: randomUUID(),
        environmentName: "x",
      });
      expect(out).toBeNull();
    } finally {
      await client.close();
    }
  });

  it("buildSubjectOverview returns 200-shaped payload for minimal subject", async () => {
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
        railType: "service",
      });

      const out = await buildSubjectOverview(db, {
        subjectId,
        organizationId: orgId,
        environmentId: envId,
        environmentName: "t-env",
      });
      expect(out).not.toBeNull();
      expect(out!.subject_header.subject_id).toBe(subjectId);
      expect(Array.isArray(out!.angles_summary)).toBe(true);
      expect(out!.angles_summary).toHaveLength(7);
      expect(Array.isArray(out!.recent_events)).toBe(true);
      expect(Array.isArray(out!.active_failures_list)).toBe(true);
      expect(out!.status_strip.total_events).toBe(0);
    } finally {
      await client.close();
    }
  });

  it("wraps dependency failures as OverviewBuildFailedError", async () => {
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
        railType: "service",
      });

      const spy = vi.spyOn(subjectService, "enrichSubjectTimestamps").mockRejectedValueOnce(new Error("simulated_db_fault"));
      await expect(
        buildSubjectOverview(db, {
          subjectId,
          organizationId: orgId,
          environmentId: envId,
          environmentName: "t-env",
        }),
      ).rejects.toBeInstanceOf(OverviewBuildFailedError);
      spy.mockRestore();
    } finally {
      await client.close();
    }
  });
});
