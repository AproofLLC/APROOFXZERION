# Development database reset (recover from corruption)

## One-glance recovery (`58P01` / missing `base/...`)

**Default local dev is file-backed PGlite** (`APROOF_DB_MODE=pglite` in `.env.example`). Docker or TCP Postgres is **optional** — only used if you point `DATABASE_URL` at a server and avoid `pglite` mode.

1. **Stop** `npm run dev` (Ctrl+C).
2. From **`APROOF/`**: `npm run dev:db:reset` (wipes the **same** PGlite dir the runtime uses — see `getResolvedPgliteDataDirectory` in `src/db/pglite.ts`).
3. Still from **`APROOF/`** (API **stopped**): `npm run dev:verify:routes`.
4. Start again: `npm run dev`.

**Avoid** putting the PGlite directory on **synced** drives (OneDrive, Dropbox, etc.); use a short local path (e.g. Windows `%TEMP%\aproof-pglite` via `PGLITE_DATA_DIR`) if needed.

## What went wrong?

If the API or logs show Postgres errors such as:

- **`58P01`** — `could not open file "base/5/6104": No such file or directory`

the on-disk database files are **corrupted**, **partially deleted**, or **out of sync** with the catalog (common after crashes, sync tools touching `data/pglite`, or mixing PGlite versions).

**Do not** try to patch individual `base/*` files. Reset the dev store and re-apply migrations + seed.

## What does local dev use?

| Configuration | Database |
|---------------|----------|
| **`APROOF_DB_MODE=pglite`** (default in `.env.example`) | Embedded **PGlite** in a directory on disk (see below). |
| **`DATABASE_URL=...`** (and not `pglite`) | **PostgreSQL** over TCP (local install or **Docker**: `docker-compose.yml` → `postgres:16` on port **5432**). |

Source of truth:

- **Runtime:** `APROOF/.env` → `APROOF/src/main.ts`
- **Migrations:** `npm run db:migrate` → `src/scripts/apply-migrations.ts` (PGlite or `DATABASE_URL` per `APROOF_DB_MODE`)
- **Drizzle kit:** `drizzle.config.ts` (uses `DATABASE_URL` only — for `db:generate` / `db:studio` against a real Postgres URL)
- **PGlite directory (single source of truth):** `getResolvedPgliteDataDirectory()` in `src/db/pglite.ts` — precedence `PGLITE_DATA_DIR` → `APROOF_PGLITE_DATA_DIR` → default `APROOF/data/pglite` (absolute `path.resolve`)

## Reset path A — PGlite (embedded, recommended dev)

1. **Stop** the API (`Ctrl+C` in the terminal running `npm run dev`).
2. **Optional:** `npm run kill:ports` so nothing holds file locks on Windows.
3. From **`APROOF/`**, run:

   ```bash
   npm run dev:db:reset
   ```

   This **deletes** the resolved PGlite data directory, then runs **`npm run db:setup`** (migrate + demo seed).

4. **Start** the API again: `npm run dev` (or set `PGLITE_DATA_DIR` as you usually do, e.g. `%TEMP%\aproof-pglite` on Windows if documented in your flow).

5. **Sanity-check** (API **stopped**, uses same PGlite files):

   ```bash
   npm run dev:verify:routes
   ```

   Or with the server running, use curl/browser:

   - `GET /health` → 200  
   - `GET /auth/session` without cookie → 401 (expected)  
   - `POST /auth/sign-up` → 201, then `GET /auth/session` → 200  
   - `GET /subjects` with session cookie → 200  
   - `GET /subjects/:id/overview` for a subject in your org → 200  
   - `POST /auth/sign-out` → 200  

**Manual equivalent** (same as the script):

```bash
# Stop the server first. Then remove the directory shown at startup:
#   [startup] Effective PGlite dir: ...
rm -rf ./data/pglite          # Unix
# or delete that folder in Explorer / PowerShell on Windows

npm run db:setup
npm run dev
```

## Reset path B — Docker PostgreSQL (`docker-compose.yml`)

1. Stop the API and optionally containers: `docker compose down`.
2. **Destroy the volume** (names may vary; list with `docker volume ls`):

   ```bash
   docker compose down -v
   ```

3. Start DB again: `docker compose up -d db` (wait for healthy).
4. From **`APROOF/`** with **`DATABASE_URL`** set (no `APROOF_DB_MODE=pglite`):

   ```bash
   npm run db:migrate
   npm run seed
   ```

5. Start the API with the same `DATABASE_URL`.

## Reset path C — local PostgreSQL (no Docker)

1. Drop and recreate the database (or drop all objects in `public`) using your admin tool.
2. `npm run db:migrate` then `npm run seed` with `DATABASE_URL` set.

## Scripts reference

| Script | Purpose |
|--------|---------|
| `npm run dev:db:reset` | **PGlite only:** wipe data dir + `db:setup`. |
| `npm run db:migrate` | Apply `drizzle/` migrations to PGlite or `DATABASE_URL`. |
| `npm run seed` | Idempotent demo seed. |
| `npm run db:setup` | `db:migrate` + `seed`. |
| `npm run kill:ports` | Free common dev ports (see `scripts/kill-repo-ports.ps1`). |
| `npm run dev:verify:routes` | PGlite only: smoke-test session / subjects / overview / sign-out (stop API first). |

## Avoiding repeat corruption (PGlite)

- Prefer a **short, non-synced** path for data: e.g. Windows **`%TEMP%\aproof-pglite`** via `PGLITE_DATA_DIR` if the repo lives under OneDrive.
- **Stop the server** before deleting or copying the PGlite folder.
- Do not point two different app versions at the **same** PGlite directory concurrently.
