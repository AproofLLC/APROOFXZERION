/**
 * Load `.env` for the AProof API and CLI tools. Must be imported before other app modules
 * that read `process.env` at load time (side-effect only).
 *
 * **Order (stable contract):**
 * 1. `APROOF/.env` at the **package root** (`resolveAproofPackageRoot()`), never secrets in logs.
 * 2. If `process.cwd()` differs from that root, `cwd/.env` is loaded **second** with `override: true`
 *    so a developer running from another directory can overlay values without editing the repo file.
 *
 * Scripts that must load env when spawned standalone (e.g. `scripts/aproof-agent-devnet-execute.mjs`)
 * also call `dotenv` against the package root; keep behavior aligned when changing paths.
 */
import path from "node:path";
import dotenv from "dotenv";
import { resolveAproofPackageRoot } from "./aproof-package-root.js";

const aproofRoot = resolveAproofPackageRoot();
dotenv.config({ path: path.join(aproofRoot, ".env") });

const cwd = process.cwd();
if (path.normalize(path.resolve(cwd)) !== path.normalize(aproofRoot)) {
  dotenv.config({ path: path.join(cwd, ".env"), override: true });
}
