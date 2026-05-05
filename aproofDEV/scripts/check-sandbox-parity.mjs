#!/usr/bin/env node
/**
 * Drift guard: SANDBOX_SCENARIO_TEMPLATES must match between frontend and APROOF.
 * Does not import product code — string parse only.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function extractTemplates(relPath) {
  const p = path.join(root, relPath);
  const s = readFileSync(p, "utf8");
  const m = s.match(/export const SANDBOX_SCENARIO_TEMPLATES = \[([\s\S]*?)\] as const/);
  if (!m) {
    throw new Error(`Could not parse SANDBOX_SCENARIO_TEMPLATES in ${relPath}`);
  }
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const fe = extractTemplates("frontend/src/constants/sandbox-scenarios.ts");
const be = extractTemplates("APROOF/src/http/sandbox-scenario-runner.ts");

const fs = fe.join("|");
const bs = be.join("|");
if (fs !== bs) {
  console.error("[check-sandbox-parity] Mismatch between frontend and APROOF template lists.");
  console.error("  frontend:", fe);
  console.error("  APROOF: ", be);
  process.exit(1);
}
console.log("[check-sandbox-parity] OK —", fe.length, "templates");
