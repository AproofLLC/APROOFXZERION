#!/usr/bin/env node
/**
 * Lightweight pre-publish checks for secrets and local-only paths.
 * Exits 0 when not inside a git work tree (local tarballs / missing .git).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function inGitWorkTree() {
  try {
    execSync("git rev-parse --is-inside-work-tree", { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function gitLsFiles() {
  const out = execSync("git ls-files", { encoding: "utf8" });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const KEYPAIR_JSON = /(keypair|anchor-devnet|zerion-agent-keypair|solana-devnet-keypair)[^/\\]*\.json$/i;

function isProblematicPath(rel) {
  const base = path.posix.basename(rel.replace(/\\/g, "/"));
  if (base === ".env") return "dotenv file";
  if (base.startsWith(".env.") && base !== ".env.example" && base !== ".env.demo.example")
    return "dotenv variant (keep only .env.example tracked)";
  const norm = rel.replace(/\\/g, "/");
  if (norm.includes("/.local/") || norm.startsWith(".local/")) return ".local path";
  if (/\.(sqlite|db)$/i.test(base)) return "database artifact";
  if (/\.pem$/i.test(base)) return "PEM material";
  if (KEYPAIR_JSON.test(base)) return "keypair JSON";
  if (norm.endsWith("/anchor-devnet.json") || norm.endsWith("/zerion-agent-keypair.json")) return "wallet JSON";
  return null;
}

function scanContentIssues(rel) {
  const issues = [];
  const norm = rel.replace(/\\/g, "/").toLowerCase();
  if (norm.includes(".test.") || norm.includes("/e2e/") || norm.includes("/fixtures/")) return issues;
  try {
    const buf = readFileSync(rel, "utf8");
    if (/sk_live_[a-z0-9]{8,}/i.test(buf) || /sk_test_[a-z0-9]{8,}/i.test(buf)) {
      issues.push("possible Stripe-style live secret");
    }
    if (/BEGIN [A-Z ]*PRIVATE KEY/.test(buf)) {
      issues.push("PEM private key block");
    }
    // Personal Windows home paths in docs/scripts are usually accidental.
    if (/C:\\Users\\[^\\]+\\/.test(buf) || /\/Users\/[^/\s]+\//.test(buf)) {
      issues.push("machine-specific user path (use <repo> placeholders)");
    }
  } catch {
    /* binary or unreadable */
  }
  return issues;
}

function main() {
  if (!inGitWorkTree()) {
    console.log("[repo:safety-check] Not a git repository — skipped tracked-file checks.");
    process.exit(0);
  }

  const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  const files = gitLsFiles();
  const reasons = new Map(); // path -> [reasons]

  for (const f of files) {
    const why = isProblematicPath(f);
    if (why) {
      const arr = reasons.get(f) ?? [];
      arr.push(why);
      reasons.set(f, arr);
    }
    const abs = path.join(root, f);
    for (const c of scanContentIssues(abs)) {
      const arr = reasons.get(f) ?? [];
      arr.push(c);
      reasons.set(f, arr);
    }
  }

  if (reasons.size > 0) {
    console.error("[repo:safety-check] FAIL — sensitive or local-only paths appear git-tracked:\n");
    for (const [f, arr] of [...reasons.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.error(`  ${f}`);
      for (const r of arr) console.error(`    - ${r}`);
    }
    console.error("\nRemove from index: git rm --cached <file>  (keep local copy if needed); ensure .gitignore covers it.");
    process.exit(1);
  }

  console.log("[repo:safety-check] OK — no tracked dotenv, .local, keypair DB, or obvious secret patterns in source paths checked.");
  process.exit(0);
}

main();
