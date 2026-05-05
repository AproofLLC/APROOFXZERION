/**
 * Register a one-off subject UUID for live/digest tests (demo org/env).
 * Usage: npx tsx src/scripts/register-test-subject.ts <uuid> <railType>
 * Example: npx tsx src/scripts/register-test-subject.ts $(uuidgen) system
 */
import { pathToFileURL } from "node:url";
import "dotenv/config";
import type { Db } from "../db/client.js";
import { createDb } from "../db/client.js";
import { subjects } from "../db/schema/index.js";
import { DEMO, ensureDemoTenant } from "./seed-demo.js";

type Rail = "system" | "service" | "agent" | "model" | "endpoint";
const RAILS = new Set<string>(["system", "service", "agent", "model", "endpoint"]);
const MAX_PGLITE_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientPgliteAbort(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("Aborted(). Build with -sASSERTIONS") || msg.includes("RuntimeError: Aborted");
}

async function register(db: Db, id: string, railType: Rail) {
  await ensureDemoTenant(db);
  await db
    .insert(subjects)
    .values({
      id,
      organizationId: DEMO.orgId,
      environmentId: DEMO.envId,
      railType,
      externalKey: `digest-test-${id.slice(0, 8)}`,
    })
    .onConflictDoNothing({ target: subjects.id });
}

async function main() {
  const id = process.argv[2]?.trim();
  const rail = process.argv[3]?.trim().toLowerCase();
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    console.error("Usage: register-test-subject.ts <subject-uuid> <railType>");
    process.exit(1);
  }
  if (!rail || !RAILS.has(rail)) {
    console.error(`railType must be one of: ${[...RAILS].join(", ")}`);
    process.exit(1);
  }
  const railTyped = rail as Rail;

  const mode = process.env.APROOF_DB_MODE?.trim().toLowerCase();
  if (mode === "pglite") {
    const { openPgliteDb, getResolvedPgliteDataDirectory } = await import("../db/pglite.js");
    const { absolutePath, source } = getResolvedPgliteDataDirectory();
    console.log("[register-test-subject] Effective DB mode: pglite");
    console.log(`[register-test-subject] Effective PGlite dir (${source}): ${absolutePath}`);
    if (source === "default") {
      console.log("[register-test-subject] PGlite dir not provided via env; using defaultPgliteDataDir().");
    }
    console.log("[register-test-subject] Demo org/env:", DEMO.orgId, DEMO.envId);
    console.log(
      "[register-test-subject] Subject row must match POST body on subject_id + organization_id + environment_id."
    );
    for (let attempt = 1; attempt <= MAX_PGLITE_RETRIES; attempt++) {
      try {
        const { client, db } = await openPgliteDb(absolutePath);
        try {
          await register(db, id, railTyped);
          break;
        } finally {
          await client.close();
        }
      } catch (error) {
        const transient = isTransientPgliteAbort(error);
        const last = attempt === MAX_PGLITE_RETRIES;
        if (!transient || last) throw error;
        const backoffMs = attempt * 500;
        console.warn(
          `[register-test-subject] transient PGlite abort on attempt ${attempt}/${MAX_PGLITE_RETRIES}; retrying in ${backoffMs}ms`
        );
        await sleep(backoffMs);
      }
    }
  } else {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) {
      console.error("Set DATABASE_URL or APROOF_DB_MODE=pglite");
      process.exit(1);
    }
    const masked = url.replace(/:[^:@/]+@/, ":****@");
    console.log("[register-test-subject] DATABASE_URL:", masked);
    console.log("[register-test-subject] Demo org/env:", DEMO.orgId, DEMO.envId);
    const db = createDb(url);
    try {
      await register(db, id, railTyped);
    } finally {
      await db.$client.end();
    }
  }
  console.log("Demo tenant: ensured (idempotent bootstrap; org already present is OK).");
  console.log(`Subject ${id} (${rail}) upserted for demo org/env (onConflictDoNothing on subject id).`);
}

const isMainCli =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isMainCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
