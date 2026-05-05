/**
 * Dev-only: delete the on-disk PGlite data directory and re-run migrations + demo seed.
 * Fixes corruption / stale catalog (e.g. Postgres 58P01 missing base/... files).
 *
 * Usage (from APROOF/): npx tsx scripts/dev-reset-pglite.ts
 * Or: npm run dev:db:reset
 *
 * Requires embedded PGlite as the dev target. Stop the API before running.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getResolvedPgliteDataDirectory, pgliteResetCliBlockedReason } from "../src/db/pglite.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aproofRoot = path.resolve(__dirname, "..");

const blocked = pgliteResetCliBlockedReason();
if (blocked) {
  console.error("[dev-reset-pglite] Refusing to delete any PGlite data directory.");
  console.error(`[dev-reset-pglite] ${blocked}`);
  console.error("[dev-reset-pglite] Next steps: see APROOF/docs/DEV-DB-RESET.md (TCP Postgres / Docker reset).");
  process.exit(1);
}

const modeRaw = process.env.APROOF_DB_MODE?.trim();
const mode = modeRaw?.toLowerCase();
const dbUrlSet = Boolean(process.env.DATABASE_URL?.trim());
console.log(
  `[dev-reset-pglite] Confirmed dev target: embedded PGlite (APROOF_DB_MODE=${modeRaw || "(unset)"}, DATABASE_URL=${dbUrlSet ? "set" : "unset"}).`
);

const { absolutePath, source } = getResolvedPgliteDataDirectory();
console.log(`[dev-reset-pglite] 1. Resolved PGlite directory (${source}): ${absolutePath}`);

if (!fs.existsSync(absolutePath)) {
  console.log("[dev-reset-pglite] 2. No existing store at that path; skipping delete.");
} else {
  console.log("[dev-reset-pglite] 2. Deleting existing PGlite store…");
  fs.rmSync(absolutePath, { recursive: true, force: true });
}

console.log("[dev-reset-pglite] 3. Running npm run db:setup …");
execSync("npm run db:setup", { cwd: aproofRoot, stdio: "inherit", shell: true, env: process.env });
console.log("[dev-reset-pglite] 4. Reset complete. Start the API with: npm run dev");
