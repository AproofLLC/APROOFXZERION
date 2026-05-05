/**
 * Extra subjects for PowerShell live tests (after `npm run seed` demo tenant).
 * Fixed UUIDs match scripts/live-ps1/live-common.ps1.
 */
import "dotenv/config";
import type { Db } from "../db/client.js";
import { createDb } from "../db/client.js";
import { subjects } from "../db/schema/index.js";
import { DEMO } from "./seed-demo.js";

const ROWS = [
  { id: "44444444-4444-4444-8444-444444444401", railType: "model" as const, externalKey: "subject-replay-001" },
  { id: "44444444-4444-4444-8444-444444444402", railType: "service" as const, externalKey: "subject-version-001" },
  { id: "44444444-4444-4444-8444-444444444411", railType: "model" as const, externalKey: "m-1" },
  { id: "44444444-4444-4444-8444-444444444412", railType: "agent" as const, externalKey: "a-1" },
  { id: "44444444-4444-4444-8444-444444444413", railType: "service" as const, externalKey: "s-1" },
  { id: "44444444-4444-4444-8444-444444444414", railType: "endpoint" as const, externalKey: "e-1" },
  { id: "44444444-4444-4444-8444-444444444415", railType: "system" as const, externalKey: "sys-1" },
  { id: "44444444-4444-4444-8444-444444444421", railType: "system" as const, externalKey: "subject-read-001" },
  { id: "44444444-4444-4444-8444-444444444422", railType: "endpoint" as const, externalKey: "subject-list-001" },
  { id: "44444444-4444-4444-8444-444444444423", railType: "system" as const, externalKey: "messy-001" },
  { id: "44444444-4444-4444-8444-444444444424", railType: "system" as const, externalKey: "concurrent-001" },
  { id: "44444444-4444-4444-8444-444444444431", railType: "system" as const, externalKey: "live-001" },
  { id: "44444444-4444-4444-8444-444444444432", railType: "model" as const, externalKey: "live-replay-001" },
  { id: "44444444-4444-4444-8444-444444444433", railType: "system" as const, externalKey: "burst-live-001" },
  // Stress suite (scripts/live-ps1/stress-*.ps1) — UUID subject_id required by API
  { id: "55555555-5555-4555-8555-000000000501", railType: "system" as const, externalKey: "stress-dup-001" },
  { id: "55555555-5555-4555-8555-000000000502", railType: "service" as const, externalKey: "stress-version-001" },
  { id: "55555555-5555-4555-8555-000000000511", railType: "model" as const, externalKey: "chaos-model-1" },
  { id: "55555555-5555-4555-8555-000000000512", railType: "agent" as const, externalKey: "chaos-agent-1" },
  { id: "55555555-5555-4555-8555-000000000513", railType: "endpoint" as const, externalKey: "chaos-endpoint-1" },
  { id: "55555555-5555-4555-8555-000000000514", railType: "model" as const, externalKey: "chaos-bad-1" },
  { id: "55555555-5555-4555-8555-000000000516", railType: "system" as const, externalKey: "chaos-system-1" },
  { id: "55555555-5555-4555-8555-000000000517", railType: "system" as const, externalKey: "chaos-system-2" },
  { id: "55555555-5555-4555-8555-000000000521", railType: "system" as const, externalKey: "rw-contention-001" },
  { id: "55555555-5555-4555-8555-000000000522", railType: "system" as const, externalKey: "soak-001" },
  { id: "55555555-5555-4555-8555-000000000523", railType: "endpoint" as const, externalKey: "page-churn-001" },
  { id: "55555555-5555-4555-8555-000000000524", railType: "system" as const, externalKey: "digest-stability-001" },
  { id: "55555555-5555-4555-8555-000000000525", railType: "model" as const, externalKey: "dup-concurrent-001" },
];

const MATRIX_BY_RAIL: Array<{ rail: (typeof ROWS)[number]["railType"]; base: number }> = [
  { rail: "model", base: 601 },
  { rail: "agent", base: 621 },
  { rail: "service", base: 641 },
  { rail: "endpoint", base: 661 },
  { rail: "system", base: 681 },
];

for (const { rail, base } of MATRIX_BY_RAIL) {
  for (let i = 1; i <= 20; i += 1) {
    const n = base + i - 1;
    const suffix = n.toString(16).padStart(12, "0");
    ROWS.push({
      id: `55555555-5555-4555-8555-${suffix}`,
      railType: rail,
      externalKey: `matrix-${rail}-${String(i).padStart(2, "0")}`,
    });
  }
}

export async function seedLiveTestSubjects(db: Db): Promise<void> {
  for (const r of ROWS) {
    await db
      .insert(subjects)
      .values({
        id: r.id,
        organizationId: DEMO.orgId,
        environmentId: DEMO.envId,
        railType: r.railType,
        externalKey: r.externalKey,
      })
      .onConflictDoNothing({ target: subjects.id });
  }
}

async function main() {
  const mode = process.env.APROOF_DB_MODE?.trim().toLowerCase();

  if (mode === "pglite") {
    const { openPgliteDb, getResolvedPgliteDataDirectory } = await import("../db/pglite.js");
    const { absolutePath, source } = getResolvedPgliteDataDirectory();
    console.log(`[seed-live-test-subjects] Effective PGlite dir (${source}): ${absolutePath}`);
    const { client, db } = await openPgliteDb(absolutePath);
    try {
      await seedLiveTestSubjects(db);
    } finally {
      await client.close();
    }
  } else {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) {
      console.error("Set DATABASE_URL or APROOF_DB_MODE=pglite");
      process.exit(1);
    }
    const db = createDb(url);
    try {
      await seedLiveTestSubjects(db);
    } finally {
      await db.$client.end();
    }
  }

  console.log("Live test subjects upserted (onConflictDoNothing). IDs align with scripts/live-ps1/live-common.ps1.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
