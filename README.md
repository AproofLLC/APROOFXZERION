# AProof

**AProof** is a deterministic proof engine for system events with verifiable integrity, provenance, and on-chain anchoring.

The active monorepo—backend, frontend, shared scripts, and product docs—lives under **[`aproofDEV/`](./aproofDEV)**. Clone or open this repository, then treat **`aproofDEV/`** as the working project root for installs and NPM scripts.

## Project Structure

- **`aproofDEV/APROOF`** → backend proof engine ([open folder](./aproofDEV/APROOF))
- **`aproofDEV/frontend`** → frontend dashboard ([open folder](./aproofDEV/frontend))

Supporting layout:

| Path | Role |
|------|------|
| [**`aproofDEV/APROOF`**](./aproofDEV/APROOF) | Backend: Fastify API, proof pipeline, ingest, PGlite/Postgres, tests |
| [**`aproofDEV/frontend`**](./aproofDEV/frontend) | Frontend: Vite + React dashboard (proofs, sandbox, session auth) |
| [`aproofDEV/docs`](./aproofDEV/docs) | Workspace docs and archived reports |
| [`aproofDEV/scripts`](./aproofDEV/scripts) | Shared tooling (`dev:stack`, `verify`, PowerShell harnesses, etc.) |

Backend-focused docs also live under [`aproofDEV/APROOF/docs`](./aproofDEV/APROOF/docs).

## Quick start

**Prerequisites:** Node.js **20+** (see [`aproofDEV/package.json`](./aproofDEV/package.json)).

### Backend (API)

Default listen port: **`3000`**.

```bash
cd aproofDEV/APROOF
npm install
npm run dev
```

Local DB defaults to **PGlite** (file-backed under `aproofDEV/APROOF/data/`). Copy [`aproofDEV/APROOF/.env.example`](./aproofDEV/APROOF/.env.example) to `aproofDEV/APROOF/.env` for overrides (never commit secrets).

### Frontend (dashboard)

Dev server (**Vite**): **`5173`** (strict; use only this origin in the browser so the proxy works).

```bash
cd aproofDEV/frontend
npm install
npm run dev
```

Open **`http://127.0.0.1:5173`** (e.g. **`/app/proofs`**). Do not load the SPA from the raw API URL—use the Vite dev server so API calls proxy correctly.

### Full interactive stack (API + Vite + Devnet preflight)

From **`aproofDEV/`** after `npm install`:

```bash
cd aproofDEV
npm install
npm run stop:stack   # optional: free ports
npm run dev:stack
```

This starts the API (typically **`:3000`**) and the UI on **`:5173`**. After startup, run `npm run dev:check` from `aproofDEV/` for health and proxy checks. See **`aproofDEV/README.md`** for the detailed manual workflow (`dev:stack`, Devnet profile, troubleshooting).

### Verification & CI

One-shot verification from **`aproofDEV/`**:

```bash
cd aproofDEV
npm install
npm run verify
```

Workflow file: **[`.github/workflows/ci.yml`](./aproofDEV/.github/workflows/ci.yml)** (triggered from paths under **`aproofDEV/`** as configured).

## More documentation

For sandbox behavior, Solana Devnet anchoring, release bundles, deployment, and deep-dive guides, read the workspace README:

- **[`aproofDEV/README.md`](./aproofDEV/README.md)** — full developer guide (paths inside that document are relative to `aproofDEV/`)
- [`aproofDEV/docs/README.md`](./aproofDEV/docs/README.md)
- [`aproofDEV/docs/DEPLOYMENT.md`](./aproofDEV/docs/DEPLOYMENT.md)
