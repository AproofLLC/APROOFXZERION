#!/usr/bin/env node
/**
 * Cross-path consistency checks (no DB, no network):
 * - Rail auto-enabled: APROOF `auto-enabled-angles-by-rail.ts` (SSOT) ↔ `angle-control` import ↔ `frontend` re-export
 * - SANDBOX_SCENARIO_TEMPLATES: frontend ↔ APROOF src
 * - demo-curated.ts template ids ⊆ backend list
 * - Optional: APROOF dist sandbox runner matches src (when dist exists)
 * - Vite proxy vs backend port env precedence (documentation warning only)
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function extractSandboxTemplatesFromTs(relPath) {
  const p = path.join(root, relPath);
  const s = readFileSync(p, "utf8");
  const m = s.match(/export const SANDBOX_SCENARIO_TEMPLATES = \[([\s\S]*?)\] as const/);
  if (!m) throw new Error(`[integrity] Could not parse SANDBOX_SCENARIO_TEMPLATES in ${relPath}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function extractDemoCuratedTemplateIds() {
  const p = path.join(root, "frontend/src/constants/demo-curated.ts");
  const s = readFileSync(p, "utf8");
  const ids = new Set();
  const entry = s.match(/export const DEMO_ENTRY_TEMPLATE = "([^"]+)" as const/);
  if (entry) ids.add(entry[1]);
  const obj = s.match(/export const DEMO_SCENARIO_TEMPLATE = \{([\s\S]*?)\}\s*as const;/);
  if (!obj) throw new Error("[integrity] Could not parse DEMO_SCENARIO_TEMPLATE in demo-curated.ts");
  for (const m of obj[1].matchAll(/:\s*"([a-z0-9_]+)"/g)) {
    ids.add(m[1]);
  }
  return [...ids];
}

function extractTemplatesFromDistJs(relPath) {
  const p = path.join(root, relPath);
  const s = readFileSync(p, "utf8");
  const m = s.match(/SANDBOX_SCENARIO_TEMPLATES\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function fail(msg) {
  console.error(`[integrity] FAIL — ${msg}`);
  process.exit(1);
}

const RAIL_KEYS = ["model", "agent", "service", "endpoint", "system"];

/** Must match `PRODUCT_ANGLE_NAMES` in APROOF/src/product/product-proof.ts (the seven valid angle ids). */
const PRODUCT_ANGLES = new Set([
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
]);

/**
 * Parse `APROOF/src/baselines/auto-enabled-angles-by-rail.ts` and return { model: string[], ... } in source order.
 * Handles both inline arrays (e.g. `model: ["a", "b"]`) and shared reference (e.g. `model: ALL_ANGLES`).
 */
function extractAutoEnabledFromSsot(source) {
  const sharedArrayMatch = source.match(/const\s+ALL_ANGLES[^=]*=\s*\[\s*([\s\S]*?)\]\s*as\s+const/);
  let sharedAngles = null;
  if (sharedArrayMatch) {
    sharedAngles = sharedArrayMatch[1]
      .split(",")
      .map((s) => s.replace(/["'\r\n\t]/g, ""))
      .map((s) => s.split("//")[0].trim())
      .map((s) => s.split("/*")[0].trim())
      .filter(Boolean);
  }

  const out = {};
  for (const r of RAIL_KEYS) {
    const inlineRe = new RegExp(`\\b${r}:\\s*\\[\\s*([\\s\\S]*?)\\]\\s*,?`, "m");
    const inlineMatch = source.match(inlineRe);
    if (inlineMatch) {
      out[r] = inlineMatch[1]
        .split(",")
        .map((s) => s.replace(/["'\r\n\t]/g, ""))
        .map((s) => s.split("//")[0].trim())
        .map((s) => s.split("/*")[0].trim())
        .filter(Boolean);
    } else {
      const refRe = new RegExp(`\\b${r}:\\s*(\\w+)\\s*,?`, "m");
      const refMatch = source.match(refRe);
      if (refMatch && sharedAngles) {
        out[r] = [...sharedAngles];
      } else {
        fail(`[integrity] auto-enabled-angles-by-rail.ts: missing or malformed array for ${r}`);
      }
    }
  }
  return out;
}

function assertKnownAngles(angles) {
  for (const a of angles) {
    if (!PRODUCT_ANGLES.has(a)) {
      fail(`[integrity] unknown angle name in SSOT: ${a}`);
    }
  }
}

function assertUniqueOrder(arr) {
  const s = new Set();
  for (const x of arr) {
    if (s.has(x)) fail(`[integrity] duplicate angle in same rail: ${x}`);
    s.add(x);
  }
}

/**
 * Rail auto-enabled: single file (SSOT) + frontend re-export + angle-control import — no hand-duplicated tables.
 */
function railAutoEnabledParity() {
  const ssotPath = path.join(root, "APROOF/src/baselines/auto-enabled-angles-by-rail.ts");
  const acPath = path.join(root, "APROOF/src/baselines/angle-control.ts");
  const fePath = path.join(root, "frontend/src/constants/rail-auto-enabled.ts");

  const ssot = readFileSync(ssotPath, "utf8");
  const ac = readFileSync(acPath, "utf8");
  const fe = readFileSync(fePath, "utf8");

  if (!/from\s+["'][^"']*auto-enabled-angles-by-rail(\.js|\.ts)?["']/.test(ac)) {
    fail("angle-control.ts must use a from-import of the SSOT module (auto-enabled-angles-by-rail)");
  }
  if (!/from\s+["']@aproof\/baselines\/auto-enabled-angles-by-rail(\\.ts)?["']/.test(fe)) {
    fail("frontend must re-export from @aproof/baselines/auto-enabled-angles-by-rail (SSOT, no hand tables)");
  }
  if (/^\s*model:\s*\[/m.test(fe)) {
    fail("frontend/src/constants/rail-auto-enabled.ts must not define a local model: [ ... ] table; use the SSOT re-export");
  }
  for (const r of RAIL_KEYS) {
    if (new RegExp(`^\\s*${r}:\\s*\\[`, "m").test(fe)) {
      fail(`frontend must not re-declare the ${r} array — use the SSOT re-export only`);
    }
  }

  const table = extractAutoEnabledFromSsot(ssot);
  for (const r of RAIL_KEYS) {
    const arr = table[r];
    assertUniqueOrder(arr);
    assertKnownAngles(arr);
  }

  if (Object.keys(table).length !== RAIL_KEYS.length) fail("SSOT: expected five rails only");

  const ssotHash = JSON.stringify(RAIL_KEYS.map((k) => [k, table[k]]));
  const rehash = JSON.stringify(RAIL_KEYS.map((k) => [k, extractAutoEnabledFromSsot(ssot)[k]]));
  if (ssotHash !== rehash) fail("SSOT parse instability — fix extractAutoEnabledFromSsot");
  if (RAIL_KEYS.join("|") !== "model|agent|service|endpoint|system") {
    fail("RAIL_KEYS order drift");
  }

  console.log("[integrity] OK — rail auto-enabled (SSOT + angle-control + frontend re-export, member/order checks)");
}

function main() {
  railAutoEnabledParity();

  const fe = extractSandboxTemplatesFromTs("frontend/src/constants/sandbox-scenarios.ts");
  const be = extractSandboxTemplatesFromTs("APROOF/src/http/sandbox-scenario-runner.ts");

  if (fe.join("|") !== be.join("|")) {
    console.error("[integrity] Sandbox template list mismatch (frontend vs APROOF src).");
    console.error("  frontend:", fe);
    console.error("  backend: ", be);
    fail("Run check-sandbox-parity or align both files.");
  }
  console.log("[integrity] OK — sandbox templates match (frontend ↔ APROOF src):", fe.length, "ids");

  const demoIds = extractDemoCuratedTemplateIds();
  const beSet = new Set(be);
  const orphan = demoIds.filter((id) => !beSet.has(id));
  if (orphan.length) {
    console.error("[integrity] demo-curated.ts references unknown template ids:", orphan);
    fail("Update demo-curated.ts or add scenarios to sandbox-scenario-runner.ts");
  }
  console.log("[integrity] OK — demo-curated templates ⊆ backend:", demoIds.join(", "));

  const distJs = "APROOF/dist/http/sandbox-scenario-runner.js";
  if (existsSync(path.join(root, distJs))) {
    const distList = extractTemplatesFromDistJs(distJs);
    if (!distList || distList.join("|") !== be.join("|")) {
      console.error("[integrity] APROOF dist sandbox list out of sync with src.");
      console.error("  src: ", be);
      console.error("  dist:", distList ?? "(unparsed)");
      fail("Run: cd APROOF && npm run build");
    }
    console.log("[integrity] OK — APROOF dist sandbox runner matches src");
  } else {
    console.log("[integrity] SKIP — APROOF/dist not present (build to verify dist parity)");
  }

  console.log(
    "[integrity] NOTE — Vite default proxy uses APROOF_PORT (not PORT); backend listen uses PORT → APROOF_PORT → 3000.",
  );
  console.log("          dev:stack sets VITE_API_PROXY_TARGET explicitly to avoid mismatch.");
  console.log("[integrity] PASS — all automated consistency checks");
}

main();
