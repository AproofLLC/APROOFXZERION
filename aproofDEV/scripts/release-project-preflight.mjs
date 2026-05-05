#!/usr/bin/env node

/**

 * Combined-project release preflight.

 * Fails if a tracked `.env` / `.env.*` (other than `.env.example`) exists under bundle source paths.

 * **Untracked** local `.env` files are allowed — use them for dev; never `git add` secrets.

 *

 * Usage (repo root): npm run release:preflight

 */

import { existsSync } from "node:fs";

import path from "node:path";

import { fileURLToPath } from "node:url";

import { listGitTrackedForbiddenEnvPaths } from "./release-shared.mjs";



const here = path.dirname(fileURLToPath(import.meta.url));

const root = path.join(here, "..");



if (!existsSync(path.join(root, ".git"))) {

  console.warn(

    "[release:preflight] No `.git` directory — skipped tracked-env check (not a git clone). Initialize git for strict secret checks.",

  );

  console.log("Release preflight passed (no git).");

  process.exit(0);

}



let violations;

try {

  violations = listGitTrackedForbiddenEnvPaths(root);

} catch (e) {

  console.error("RELEASE PREFLIGHT FAILED: could not run `git ls-files`.", e.message || e);

  process.exit(1);

}



const unique = [...new Set(violations)];



if (unique.length > 0) {

  console.error("RELEASE PREFLIGHT FAILED: tracked environment files must not be committed:");

  for (const v of unique.sort()) {

    console.error(`  - ${v}`);

  }

  console.error("\nRemove them from git history / index. Only `.env.example` may be tracked.");

  console.error("For local secrets, keep `.env` untracked (default) or use ignored overlay files — see README.");

  process.exit(1);

}



console.log("Release preflight passed: no forbidden tracked `.env` files under bundle sources.");

