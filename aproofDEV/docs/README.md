# Documentation

## Sandbox

The sandbox is a **real** testnet workspace: sign-up, session cookie, and the same API surface as production. Optional **demo scenarios** run through normal subject creation and event ingest so proofs, failures, and lineages match production behavior—only the environment mode and data scope differ.

Scenario IDs are shared between backend (`APROOF/src/http/sandbox-scenario-runner.ts`) and frontend (`frontend/src/constants/sandbox-scenarios.ts`).

- **[SANDBOX-EXPLORER-NOTES.md](./SANDBOX-EXPLORER-NOTES.md)** — printable checklist / session log for Demo Mode in the product (tabs, demo controls, what each action hits on the API).

## Proof system (high level)

- Events are ingested via **`POST /events`** (API key or session-backed flows).
- The pipeline evaluates **seven integrity angles** (policy, identity, operational, model, retrieval, deterministic, cross-system) where applicable.
- Reads (subjects, overview, proofs, events, failures, lineages, baselines) are the **only** product read surface; the UI consumes those routes.

## Reports

- `reports/INTEGRATION-REPORT.md` — frontend ↔ API integration notes and checklist.

## Deployment

- `DEPLOYMENT.md` — production topology, Docker example, health checks, env vars (separate from local `dev:stack`).
