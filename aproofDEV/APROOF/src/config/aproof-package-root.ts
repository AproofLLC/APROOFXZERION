/**
 * Absolute path to the APROOF npm package root (directory containing package.json),
 * derived from this file's location so it is stable even when `process.cwd()` differs.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveAproofPackageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..");
}
