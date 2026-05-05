/**
 * Demo tenant bootstrap (idempotent). Safe to run `npm run seed` or `register-test-subject` repeatedly.
 * PGlite: `APROOF_DB_MODE=pglite` then `npm run db:migrate` and `npm run seed`.
 * Postgres: `DATABASE_URL=...` then `npm run db:migrate` and `npm run seed`.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import "dotenv/config";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { createDb } from "../db/client.js";
import {
  apiKeys,
  baselines,
  environments,
  mappingRules,
  organizations,
  subjects,
} from "../db/schema/index.js";
import { seedRealSubjectReadiness, REAL_SUBJECT } from "../demo/real-subject-readiness.js";

export const DEMO = {
  orgId: "11111111-1111-4111-8111-111111111111",
  envId: "22222222-2222-4222-8222-222222222222",
  subjectId: "33333333-3333-4333-8333-333333333333",
  /** Stable PKs so `npm run seed` and `register-test-subject` can run repeatedly without duplicates. */
  mappingRuleId: "33333333-3333-4333-8333-333333333341",
  baselineId: "33333333-3333-4333-8333-333333333342",
  apiKeyId: "33333333-3333-4333-8333-333333333343",
  apiKeyPlain: "aproof_demo_insecure_change_me",
} as const;

/**
 * Idempotent demo tenant: safe to call from `npm run seed`, `register-test-subject`, or tests.
 * Fixed UUIDs unchanged; uses ON CONFLICT DO NOTHING on primary keys.
 */
export async function ensureDemoTenant(db: Db): Promise<void> {
  const keyHash = createHash("sha256").update(DEMO.apiKeyPlain, "utf8").digest("hex");
  const keyPrefix = DEMO.apiKeyPlain.slice(0, 8);

  await db
    .insert(organizations)
    .values({ id: DEMO.orgId, name: "demo-org" })
    .onConflictDoNothing({ target: organizations.id });

  await db
    .insert(environments)
    .values({ id: DEMO.envId, organizationId: DEMO.orgId, name: "dev" })
    .onConflictDoNothing({ target: environments.id });

  await db
    .insert(subjects)
    .values({
      id: DEMO.subjectId,
      organizationId: DEMO.orgId,
      environmentId: DEMO.envId,
      railType: "service",
      externalKey: "demo-service",
    })
    .onConflictDoNothing({ target: subjects.id });

  await db
    .insert(mappingRules)
    .values({
      id: DEMO.mappingRuleId,
      organizationId: DEMO.orgId,
      environmentId: DEMO.envId,
      sourceTypeKey: "demo.policy_checked",
      canonicalEventType: "policy_checked",
      isActive: true,
    })
    .onConflictDoNothing({
      target: [mappingRules.organizationId, mappingRules.environmentId, mappingRules.sourceTypeKey],
    });

  await db
    .insert(baselines)
    .values({
      id: DEMO.baselineId,
      organizationId: DEMO.orgId,
      environmentId: DEMO.envId,
      subjectId: DEMO.subjectId,
      angle: "policy_integrity",
      version: 1,
      definition: {
        type: "policy_integrity_v1",
        required_tags: ["allow_read"],
      },
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      effectiveTo: null,
    })
    .onConflictDoNothing({
      target: [baselines.subjectId, baselines.angle, baselines.version],
    });

  const [existingKey] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);
  if (!existingKey) {
    await db.insert(apiKeys).values({
      id: DEMO.apiKeyId,
      organizationId: DEMO.orgId,
      environmentId: DEMO.envId,
      name: "demo",
      keyPrefix,
      keyHash,
    });
  }

  await seedRealSubjectReadiness(db);
}

export async function seedDemo(db: Db): Promise<void> {
  await ensureDemoTenant(db);
}

async function main() {
  const mode = process.env.APROOF_DB_MODE?.trim().toLowerCase();

  if (mode === "pglite") {
    const { openPgliteDb, getResolvedPgliteDataDirectory } = await import("../db/pglite.js");
    const { absolutePath, source } = getResolvedPgliteDataDirectory();
    console.log(`[seed-demo] Effective PGlite dir (${source}): ${absolutePath}`);
    const { client, db } = await openPgliteDb(absolutePath);
    try {
      await seedDemo(db);
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
      await seedDemo(db);
    } finally {
      await db.$client.end();
    }
  }

  console.log("Seed complete (idempotent). Use header X-API-Key:", DEMO.apiKeyPlain);
  console.log("organization_id:", DEMO.orgId);
  console.log("environment_id:", DEMO.envId);
  console.log("subject_id:", DEMO.subjectId);
  console.log('source_type_key: "demo.policy_checked"');
  console.log('POST /events with payload.policy.tags including "allow_read" for conformant proof.');
  console.log("[real-subject] subject_type:", REAL_SUBJECT.subject_type);
  console.log("[real-subject] subject_id:", REAL_SUBJECT.subject_id);
  console.log('[real-subject] source_type_keys: "demo.real.action_completed", "demo.real.policy_checked", "demo.real.retrieval_completed"');
}

const isMainCli =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isMainCli) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
