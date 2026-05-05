import "dotenv/config";
import { resolveListenPortFromEnv, formatListenPortLogSuffix } from "./config/runtime-env.js";
import { buildServer } from "./http/server.js";

const mode = process.env.APROOF_DB_MODE?.trim().toLowerCase();
const { port, source: portSource } = resolveListenPortFromEnv();
const host = process.env.HOST ?? "0.0.0.0";
console.log(`[startup] Effective port: ${port}${formatListenPortLogSuffix(portSource)}`);

if (mode === "pglite") {
  const pgl = await import("./db/pglite.js");
  const { absolutePath, source: dirSource } = pgl.getResolvedPgliteDataDirectory();
  console.log("[startup] APROOF_DB_MODE=pglite");
  console.log(`[startup] Effective PGlite dir: ${absolutePath}${pgl.formatPgliteDirLogSuffix(dirSource)}`);
  try {
    const { client, db } = await pgl.openPgliteDb(absolutePath);
    const app = buildServer(db);
    await app.listen({ port, host });
    app.log.info(`listening on ${host}:${port} (PGlite: ${absolutePath})`);

    const shutdown = async () => {
      await app.close();
      await client.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    if (pgl.isLikelyPgliteStorageCorruptionError(error)) {
      pgl.logPgliteCorruptionRecoveryHint(absolutePath);
      process.exit(1);
    }
    console.error("[startup] PGlite startup failed:", error);
    console.error(
      "[startup] Try: Node 20 or 22; run from APROOF/; set PGLITE_DATA_DIR to a short local path (e.g. %TEMP%\\aproof-pglite on Windows—OneDrive-synced repo folders often break WASM PGlite); increase APROOF_PGLITE_OPEN_RETRIES; or use DATABASE_URL with Postgres."
    );
    process.exit(1);
  }
} else {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("Set DATABASE_URL or APROOF_DB_MODE=pglite for embedded Postgres.");
    process.exit(1);
  }
  const { createDb } = await import("./db/client.js");
  const db = createDb(url);
  const app = buildServer(db);
  await app.listen({ port, host });
  app.log.info(`listening on ${host}:${port}`);
}
