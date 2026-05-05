/**
 * APROOF package release preflight.
 * - Junk at APROOF root (node_modules, dist, …) — filesystem
 * - Env files: **git-tracked** `.env*` under APROOF/ only (untracked `.env` allowed for local dev)
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listGitTrackedForbiddenEnvPaths,
  scanDisallowedRootOnly,
} from "../../scripts/release-shared.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const aproofRoot = path.join(here, "..");
const repoRoot = path.join(here, "..", "..");

const rootViolations = scanDisallowedRootOnly(aproofRoot);

let envViolations = [];
if (!existsSync(path.join(repoRoot, ".git"))) {
  console.warn(
    "[APROOF release:preflight] No monorepo `.git` — skipped tracked-env scan. Use the repo root for full checks.",
  );
} else {
  try {
    envViolations = listGitTrackedForbiddenEnvPaths(repoRoot, { pathMustStartWith: "APROOF/" });
  } catch (e) {
    console.error("PREFLIGHT FAILED: git ls-files error", e.message || e);
    process.exit(1);
  }
}

const violations = [...new Set([...rootViolations, ...envViolations])];

if (violations.length > 0) {
  console.error("PREFLIGHT FAILED: disallowed artifacts:");
  for (const v of violations.sort()) {
    console.error(`  - ${v}`);
  }
  console.error("\nRemove junk dirs from APROOF root and ensure no .env files are committed under APROOF/.");
  process.exit(1);
}

console.log("Preflight passed: APROOF root clean; no forbidden tracked env files under APROOF/.");
