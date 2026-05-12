/**
 * Shared rules for release packaging (root + APROOF bundle scripts).
 * Not used at runtime by the product.
 *
 * Preflight / bundle env policy: **tracked** `.env*` files (except `.env.example`) are forbidden.
 * Untracked local `.env` files are ignored — normal dev; never commit secrets.
 */
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

/** Directory name segments to skip when copying or scanning (never ship). */
export const COPY_SKIP_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "data",
  "tmp",
  "coverage",
  ".git",
  ".vite",
  "build",
  "logs",
]);

/** Top-level names that must not exist for APROOF-only clean preflight (workspace hygiene). */
export const ROOT_DENY_NAMES = new Set([
  "node_modules",
  "dist",
  "data",
  "tmp",
  "coverage",
]);

/** True if this file must never appear in a release artifact. `.env.example` is allowed. */
export function isForbiddenEnvBaseName(name) {
  if (name === ".env.example") return false;
  if (name === ".env.demo.example") return false;
  if (name === ".env") return true;
  if (name.startsWith(".env.")) return true;
  return false;
}

/**
 * Posix relative path is under the combined bundle (APROOF, frontend, docs, scripts) or repo-root env files.
 */
export function isUnderCombinedBundleRel(relPosix) {
  const n = relPosix.replace(/\\/g, "/");
  if (n === ".env" || (n.startsWith(".env.") && !n.includes("/"))) return true;
  return ["APROOF/", "frontend/", "docs/", "scripts/"].some((p) => n.startsWith(p));
}

/**
 * Forbidden env files **currently tracked by git** under the repo (strict, shareable source).
 * @param {string} repoRoot - Workspace root (directory containing `.git`)
 * @param {{ pathMustStartWith?: string }} [options] - e.g. `{ pathMustStartWith: 'APROOF/' }` for APROOF-only
 * @returns {string[]} Absolute paths
 */
export function listGitTrackedForbiddenEnvPaths(repoRoot, options = {}) {
  const { pathMustStartWith = null } = options;
  const out = execSync("git ls-files -z", {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const files = out.split("\0").filter(Boolean);
  const bad = [];
  for (const rel of files) {
    const posix = rel.replace(/\\/g, "/");
    if (pathMustStartWith && !posix.startsWith(pathMustStartWith)) continue;
    if (!isUnderCombinedBundleRel(posix)) continue;
    const base = path.basename(posix);
    if (!isForbiddenEnvBaseName(base)) continue;
    bad.push(path.join(repoRoot, rel));
  }
  return bad;
}

/**
 * Recursively find real env files under dir (skips COPY_SKIP_SEGMENTS).
 */
export function scanForbiddenEnvFiles(rootDir) {
  const violations = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (COPY_SKIP_SEGMENTS.has(e.name)) continue;
        walk(full);
      } else if (e.isFile() && isForbiddenEnvBaseName(e.name)) {
        violations.push(full);
      }
    }
  }
  walk(rootDir);
  return violations;
}

/** APROOF-only: disallowed entries directly under a package root. */
export function scanDisallowedRootOnly(packageRoot) {
  const violations = [];
  let entries;
  try {
    entries = readdirSync(packageRoot, { withFileTypes: true });
  } catch {
    return violations;
  }
  for (const entry of entries) {
    if (ROOT_DENY_NAMES.has(entry.name)) {
      violations.push(path.join(packageRoot, entry.name));
      continue;
    }
    if (entry.isFile() && isForbiddenEnvBaseName(entry.name)) {
      violations.push(path.join(packageRoot, entry.name));
    }
  }
  return violations;
}

export function shouldIncludeFileInCopy(basename) {
  const n = basename.toLowerCase();
  if (n === ".ds_store" || n === "thumbs.db") return false;
  if (n.endsWith(".log") || n.endsWith(".sqlite") || n.endsWith(".db")) return false;
  if (isForbiddenEnvBaseName(basename)) return false;
  return true;
}

/** cpSync filter: `srcPath` is source; `root` is the package root being copied. */
export function makeCopyFilter(root) {
  return (srcPath) => {
    const rel = path.relative(root, srcPath);
    if (rel === "" || rel === ".") return true;
    const segments = rel.split(/[/\\]/).filter(Boolean);
    for (const seg of segments) {
      if (COPY_SKIP_SEGMENTS.has(seg)) return false;
      if (isForbiddenEnvBaseName(seg)) return false;
    }
    return shouldIncludeFileInCopy(path.basename(srcPath));
  };
}
