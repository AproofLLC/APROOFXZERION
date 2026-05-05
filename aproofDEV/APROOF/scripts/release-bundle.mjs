import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listGitTrackedForbiddenEnvPaths,
  makeCopyFilter,
  scanDisallowedRootOnly,
} from "../../scripts/release-shared.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const repoRoot = path.join(here, "..", "..");
const outDir = path.join(root, "tmp", "release-bundle");

const rootViolations = scanDisallowedRootOnly(root);
let envViolations = [];
if (existsSync(path.join(repoRoot, ".git"))) {
  try {
    envViolations = listGitTrackedForbiddenEnvPaths(repoRoot, { pathMustStartWith: "APROOF/" });
  } catch (e) {
    console.error("BUNDLE FAILED: git ls-files error", e.message || e);
    process.exit(1);
  }
} else {
  console.warn("[APROOF release:bundle] No monorepo .git — skipped tracked-env scan.");
}
const violations = [...new Set([...rootViolations, ...envViolations])];

if (violations.length > 0) {
  console.error("PREFLIGHT FAILED: disallowed artifacts found under APROOF:");
  for (const v of violations.sort()) {
    console.error(`  - ${v}`);
  }
  console.error("\nRemove these before creating a clean release bundle.");
  console.error("Allowed exceptions: .env.example");
  process.exit(1);
}

const includePaths = [
  "src",
  "e2e",
  "docs",
  "drizzle",
  "scripts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "vitest.config.ts",
  "drizzle.config.ts",
  ".gitignore",
  ".env.example",
  "docker-compose.yml",
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const rel of includePaths) {
  const src = path.join(root, rel);
  if (!existsSync(src)) continue;
  const dest = path.join(outDir, rel);
  cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: makeCopyFilter(root),
  });
}

writeFileSync(
  path.join(outDir, "BUNDLE_NOTE.txt"),
  [
    "APROOF clean bundle",
    "",
    "This folder excludes local runtime state and secrets (.env*, node_modules, dist, data, tmp, coverage).",
    "Preflight checks ensured no disallowed artifacts leaked into this bundle.",
  ].join("\n"),
  "utf8"
);

console.log(`Clean release bundle created at: ${outDir}`);
