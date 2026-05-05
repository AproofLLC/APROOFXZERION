#!/usr/bin/env node
/**
 * Canonical combined-project source bundle (reviewer / investor / grant handoff).
 * Produces a clean tree under tmp/release-bundle/aproof-project/
 *
 * Usage (repo root): npm run release
 * Requires: npm run release:preflight (or use npm run release:pack)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listGitTrackedForbiddenEnvPaths, makeCopyFilter } from "./release-shared.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const outDir = path.join(root, "tmp", "release-bundle", "aproof-project");

function assertNoForbiddenInOutput() {
  const bad = [];
  const skipScan = new Set(["node_modules", "dist", "data", "tmp", "coverage", ".git"]);

  function walk(dir, relBase = "") {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = relBase ? `${relBase}/${e.name}` : e.name;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (skipScan.has(e.name)) {
          bad.push(`unexpected dir in bundle: ${rel}`);
          continue;
        }
        walk(full, rel);
      } else if (e.isFile()) {
        const bn = e.name;
        if (bn === ".env" || (bn.startsWith(".env.") && bn !== ".env.example")) {
          bad.push(`unexpected env file in bundle: ${rel}`);
        }
      }
    }
  }

  walk(outDir);
  if (bad.length) {
    console.error("BUNDLE VERIFY FAILED:");
    for (const b of bad) console.error(`  - ${b}`);
    process.exit(1);
  }
}

/* Safety: refuse to bundle if forbidden env files are git-tracked (same rule as release:preflight) */
if (!existsSync(path.join(root, ".git"))) {
  console.error("Refusing to bundle: not a git checkout (missing .git). Release requires git for env safety checks.");
  process.exit(1);
}
let envViolations;
try {
  envViolations = listGitTrackedForbiddenEnvPaths(root);
} catch (e) {
  console.error("Refusing to bundle: `git ls-files` failed.", e.message || e);
  process.exit(1);
}
if (envViolations.length) {
  console.error("Refusing to bundle: tracked env files present. Run `npm run release:preflight` and fix.");
  process.exit(1);
}

const required = ["APROOF", "frontend", "README.md"];
for (const r of required) {
  if (!existsSync(path.join(root, r))) {
    console.error(`Missing required path: ${r}`);
    process.exit(1);
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const copyTrees = [
  ["APROOF", "APROOF"],
  ["frontend", "frontend"],
  ["docs", "docs"],
  ["scripts", "scripts"],
];

for (const [srcRel, destRel] of copyTrees) {
  const src = path.join(root, srcRel);
  if (!existsSync(src)) continue;
  const dest = path.join(outDir, destRel);
  const filter = makeCopyFilter(src);
  cpSync(src, dest, { recursive: true, filter });
}

const rootFilesToCopy = [".gitignore", "README.md", "package.json"];
for (const name of rootFilesToCopy) {
  const src = path.join(root, name);
  if (!existsSync(src)) continue;
  cpSync(src, path.join(outDir, name), { force: true });
}

writeFileSync(
  path.join(outDir, "BUNDLE_NOTE.txt"),
  [
    "Aproof — combined source bundle",
    "",
    "Includes: APROOF (backend), frontend (UI), docs/, scripts/, root README and tooling.",
    "Excludes by construction: node_modules, dist, build, data, tmp, logs, coverage, secrets (.env* except .env.example).",
    "",
    "Official export: from repo root, run: npm run release:preflight && npm run release",
    "Install: cd APROOF && npm install && … (see README.md)",
  ].join("\n"),
  "utf8"
);

assertNoForbiddenInOutput();

console.log(`Clean combined release bundle created at:\n  ${outDir}`);
