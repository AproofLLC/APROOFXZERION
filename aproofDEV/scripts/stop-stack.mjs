#!/usr/bin/env node
/** Official shutdown for the interactive stack: free dev ports used by API + Vite. */
/* eslint-disable no-console */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("Stopping interactive stack (freeing dev ports)…");

const r = spawnSync("npm", ["run", "kill:all", "--prefix", "APROOF"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

process.exit(r.status ?? 1);
