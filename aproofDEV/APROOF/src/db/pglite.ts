import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function defaultPgliteDataDir(): string {
  return path.join(process.cwd(), "data", "pglite");
}

/** Precedence: PGLITE_DATA_DIR → APROOF_PGLITE_DATA_DIR → defaultPgliteDataDir(). */
export type PgliteDataDirSource =
  | "PGLITE_DATA_DIR"
  | "APROOF_PGLITE_DATA_DIR"
  | "default";

export function resolvePgliteDataDirFromEnv(
  env: NodeJS.ProcessEnv = process.env
): { dataDir: string; source: PgliteDataDirSource } {
  const pgliteDir = env.PGLITE_DATA_DIR?.trim();
  if (pgliteDir) return { dataDir: pgliteDir, source: "PGLITE_DATA_DIR" };

  const aproofDir = env.APROOF_PGLITE_DATA_DIR?.trim();
  if (aproofDir) return { dataDir: aproofDir, source: "APROOF_PGLITE_DATA_DIR" };

  return { dataDir: defaultPgliteDataDir(), source: "default" };
}

/**
 * Canonical on-disk path for PGlite (absolute). Use everywhere the runtime opens or resets the store
 * so `npm run dev`, `db:migrate`, and `dev:db:reset` never drift.
 */
export function getResolvedPgliteDataDirectory(
  env: NodeJS.ProcessEnv = process.env
): { absolutePath: string; source: PgliteDataDirSource } {
  const { dataDir, source } = resolvePgliteDataDirFromEnv(env);
  return { absolutePath: path.resolve(dataDir), source };
}

/** If set, `dev:db:reset` / `dev:verify:routes` must not wipe PGlite dirs (runtime is TCP Postgres). */
export function pgliteResetCliBlockedReason(env: NodeJS.ProcessEnv = process.env): string | null {
  const mode = env.APROOF_DB_MODE?.trim().toLowerCase();
  const dbUrl = env.DATABASE_URL?.trim();
  if (mode && mode !== "pglite") {
    return `APROOF_DB_MODE is "${mode}" (not pglite). This machine targets TCP Postgres — do not delete PGlite folders. See APROOF/docs/DEV-DB-RESET.md`;
  }
  if (!mode && dbUrl) {
    return "DATABASE_URL is set and APROOF_DB_MODE is unset — the API uses PostgreSQL, not file-backed PGlite. See APROOF/docs/DEV-DB-RESET.md";
  }
  return null;
}

/** Detects Postgres/file errors typical of a broken or partial PGlite data directory (e.g. HTTP 500 with code 58P01). */
export function isLikelyPgliteStorageCorruptionError(error: unknown): boolean {
  const chunks: string[] = [];
  let e: unknown = error;
  for (let depth = 0; depth < 6 && e != null; depth++) {
    if (e instanceof Error) {
      chunks.push(e.message);
      if (e.stack) chunks.push(e.stack);
      const ne = e as NodeJS.ErrnoException;
      if (ne.code === "ENOENT") return true;
    } else {
      chunks.push(String(e));
    }
    const next =
      e instanceof Error && "cause" in e
        ? (e as Error & { cause?: unknown }).cause
        : undefined;
    e = next;
  }
  const blob = chunks.join("\n");
  const lower = blob.toLowerCase();
  if (lower.includes("58p01")) return true;
  if (lower.includes("could not open file") && lower.includes("base/")) return true;
  if (lower.includes("no such file or directory") && (lower.includes("base/") || lower.includes("pg_wal")))
    return true;
  return false;
}

/** Stderr lines for `npm run dev` when PGlite open/migrate fails due to storage corruption. */
export function logPgliteCorruptionRecoveryHint(dataDirAbsolute: string): void {
  console.error("");
  console.error("[startup] =================================================================");
  console.error("[startup] Local PGlite database appears CORRUPTED or OUT OF SYNC.");
  console.error('[startup] (Example: Postgres error 58P01 — "could not open file base/...")');
  console.error(`[startup] PGlite directory: ${dataDirAbsolute}`);
  console.error("[startup]");
  console.error("[startup] Fix from the APROOF/ directory (stop this server first):");
  console.error("[startup]   npm run dev:db:reset");
  console.error("[startup]   npm run dev:verify:routes");
  console.error("[startup]   npm run dev");
  console.error("[startup] =================================================================");
  console.error("");
}

/** Log suffix for startup lines, e.g. ` (from PGLITE_DATA_DIR)` or ` (default)`. */
export function formatPgliteDirLogSuffix(source: PgliteDataDirSource): string {
  if (source === "default") return " (default)";
  return ` (from ${source})`;
}

export function migrationsFolderPath(): string {
  return path.resolve(__dirname, "../../drizzle");
}

export function assertPgliteSupportedNode(env: NodeJS.ProcessEnv = process.env): void {
  const raw = env.APROOF_NODE_VERSION_OVERRIDE?.trim() || process.versions.node;
  const major = Number(raw.split(".")[0]);
  if (!Number.isFinite(major)) return;
  if (major >= 24) {
    throw new Error(
      `PGlite runtime is not supported on Node ${raw} in this setup. Use Node 20 or 22 LTS for live PGlite testing.`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** WASM / loader hiccups on some hosts (Windows, CI); same class as register-test-subject retries. */
function isTransientPgliteInitError(error: unknown): boolean {
  const m = error instanceof Error ? error.message : String(error);
  return (
    m.includes("Aborted") ||
    m.includes("failed to initialize properly") ||
    m.includes("RuntimeError: Aborted")
  );
}

async function closePgliteQuiet(client: PGlite | undefined): Promise<void> {
  if (!client) return;
  try {
    await client.close();
  } catch {
    /* ignore */
  }
}

/** On-disk PGlite (shared by dev server, migrate, seed). Retries transient init failures. */
export async function openPgliteDb(dataDir: string) {
  assertPgliteSupportedNode();
  mkdirSync(dataDir, { recursive: true });
  const maxAttempts = Math.max(1, Number(process.env.APROOF_PGLITE_OPEN_RETRIES ?? "4") || 4);
  let last: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let client: PGlite | undefined;
    try {
      client = new PGlite(dataDir);
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder: migrationsFolderPath() });
      return { client, db };
    } catch (e) {
      last = e;
      await closePgliteQuiet(client);
      const retry = attempt < maxAttempts && isTransientPgliteInitError(e);
      if (!retry) break;
      const ms = 200 * attempt;
      console.warn(
        `[pglite] transient on-disk init failure (${attempt}/${maxAttempts}); retry in ${ms}ms:`,
        e instanceof Error ? e.message : e
      );
      await sleep(ms);
    }
  }
  throw last;
}

/** In-memory PGlite for tests (isolated, no files). */
export async function openPgliteMemory() {
  assertPgliteSupportedNode();
  const maxAttempts = Math.max(1, Number(process.env.APROOF_PGLITE_OPEN_RETRIES ?? "4") || 4);
  let last: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let client: PGlite | undefined;
    try {
      client = new PGlite();
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder: migrationsFolderPath() });
      return { client, db };
    } catch (e) {
      last = e;
      await closePgliteQuiet(client);
      const retry = attempt < maxAttempts && isTransientPgliteInitError(e);
      if (!retry) break;
      const ms = 200 * attempt;
      console.warn(
        `[pglite] transient in-memory init failure (${attempt}/${maxAttempts}); retry in ${ms}ms:`,
        e instanceof Error ? e.message : e
      );
      await sleep(ms);
    }
  }
  throw last;
}
