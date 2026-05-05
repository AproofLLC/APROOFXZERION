import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle"
);

const mode = process.env.APROOF_DB_MODE?.trim().toLowerCase();

if (mode === "pglite") {
  const { openPgliteDb, getResolvedPgliteDataDirectory } = await import("../db/pglite.js");
  const { absolutePath, source } = getResolvedPgliteDataDirectory();
  console.log(`[apply-migrations] Effective PGlite dir (${source}): ${absolutePath}`);
  const { client } = await openPgliteDb(absolutePath);
  await client.close();
  console.log("Migrations applied (PGlite).");
} else {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("Set DATABASE_URL or APROOF_DB_MODE=pglite");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}
