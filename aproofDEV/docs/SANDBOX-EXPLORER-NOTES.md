# Sandbox explorer — Demo Mode reference

This note is for **exploring the sandbox in the product** (browser + API): what to click, what fires on the wire, and how multi-rail demo data is wired. It complements the short overview in [`README.md`](./README.md).

---

## What you are running

- **Testnet workspace:** a real org and environment with `environment_mode: testnet`, session cookie (`aproof_session`), and the **same** proof pipeline as production (`processEvent`, baselines, proof units, failures, lineages).
- **No fake proof engine:** scenarios create subjects and ingest events through the normal path; outcomes come from evaluators and stored proof rows.
- **Browser entry:** use the Vite app (for example `http://127.0.0.1:5273`) so requests go through the **proxy** to the API. Opening the API port directly in the browser bypasses the SPA and proxy and is not supported for the demo shell.

---

## Session bootstrap

| Step | UI / action | API | Response fields to know |
|------|----------------|-----|-------------------------|
| Enter sandbox | Sign-up or sandbox entry flow | `POST /sandbox/session` with optional `template` | `user_id`, `organization_id`, `environment_id`, `environment_mode`, `expires_at`; if templated, `template`, `primary_subject_id`, `subject_ids`, optional `subject_ids_by_rail` |
| Client persistence | After a successful bootstrap body | (client only) | `sessionStorage`: template, primary subject, `subject_ids_by_rail` map — see `frontend/src/util/sandbox-bootstrap-storage.ts` |

**Stable body keys** for successful sandbox session responses are documented in `APROOF/src/http/sandbox-session-response.ts` (`SANDBOX_SESSION_SUCCESS_JSON_KEYS`, `SANDBOX_SESSION_BOOTSTRAP_JSON_KEYS`).

---

## Reset and replay

| Mode | When | `POST /sandbox/reset` body | Effect |
|------|------|-----------------------------|--------|
| **Full replay** | “Reset demo” / full environment seed | `template` set (for example `demo_all_rails`) and **no** targeted fields | Clears subjects in the testnet env (per server logic), reruns scenario, returns new bootstrap ids. |
| **Targeted replay** | “Run Clean Proof”, “Run Failure”, “Run Version Update” | `template: "demo_all_rails"` plus `demo_rail` and `demo_action` | Deletes **one** subject subgraph for that rail, recreates it, reapplies sandbox baseline shapes, ingests the scenario events; **does not** wipe sibling rails. |

Allowed **`demo_action`** values: `clean_proof`, `failure`, `version_update`.

Allowed **`demo_rail`** values: any member of `RAIL_TYPES` in `APROOF/src/protocol/angle-applicability.ts` (`system`, `service`, `agent`, `model`, `endpoint`). The **demo shell display order** follows `DEMO_SUBJECT_RAIL_ORDER` in `APROOF/src/http/sandbox-scenario-runner.ts`, mirrored by `frontend/src/constants/demo-rails.ts`.

---

## Scenario templates (ids and labels)

The list is **shared** between backend and frontend. Drift is caught by `node scripts/check-repo-integrity.mjs` at the repo root.

| Template id | Typical use |
|-------------|-------------|
| `clean_first_proof` | Single system subject, one clean ingest. |
| `mixed_pass_fail` | Two system subjects, pass and fail flavors. |
| `baseline_gap` | System subject with a baseline row removed for one angle. |
| `identity_mismatch` | System subject, identity fields tuned to mismatch expectations. |
| `policy_violation` | System subject, policy tags tuned to violate. |
| `lineage_version_bump` | System subject, two events on one lineage/version chain. |
| `governed_model_response` | Single **model** subject with clean model payload. |
| `demo_all_rails` | **Five** subjects (model, agent, service, endpoint, system) — primary **Demo Mode** dataset. |

**Source of truth (code):**

- Backend: `APROOF/src/http/sandbox-scenario-runner.ts` (`SANDBOX_SCENARIO_TEMPLATES`, `runSandboxScenario`).
- Frontend labels: `frontend/src/constants/sandbox-scenarios.ts` (`SANDBOX_SCENARIO_LABELS`).
- Demo entry / reset defaults: `frontend/src/constants/demo-curated.ts` (must be a subset of backend templates — integrity enforces this).

---

## Multi-rail demo (`demo_all_rails`) — one row per rail

| Rail | Subject id pattern | Clean / failure / version payloads |
|------|-------------------|-----------------------------------|
| `model` | Deterministic UUID scoped to env + template + `subject-model` | `cleanModelPolicyCheckedPayload`, policy failure variant, version bump on model identity / digest |
| `agent` | … `subject-agent` | `cleanAgentPolicyCheckedPayload`, policy + operational failure, agent + digest v2 |
| `service` | … `subject-service` | `cleanServicePolicyCheckedPayload`, operational failure, service digest v2 |
| `endpoint` | … `subject-endpoint` | `cleanEndpointPolicyCheckedPayload`, invalid token identity failure, endpoint interface/digest v2 |
| `system` | … `subject-system` | `cleanSystemControlPayload`, cross-system mismatch failure, workflow/policy/digest v2 |

Payload builders live in `APROOF/src/demo/demo-clean-payloads.ts`. Per-rail baseline **shapes** merged after `createSubject` live in `APROOF/src/demo/sandbox-rail-baseline-shapes.ts` (`applySandboxRailBaselineShapes`).

**Ingest source type:** sandbox helpers use the default mapping key `aproof.default.action_completed`, so canonical type is **`action_completed`** unless mapping rules are changed in the environment.

**Baseline effective time:** for subjects that go through `applySandboxRailBaselineShapes`, baseline `effectiveFrom` is set to an early fixed instant so fixed **historical** `occurred_at` timestamps in sandbox events still resolve active baselines (see implementation in `sandbox-rail-baseline-shapes.ts`). Legacy templates that only call `createSubject` + ingest without that helper may behave differently for proof resolution; the **five-rail** demo is the supported “full truth” path.

---

## Proof shell (UI) — tabs and controls

**Route:** `/app/proofs` (and variants that mount the same shell in demo mode).

| Tab | What it shows | After targeted action (orchestrator) |
|-----|----------------|--------------------------------------|
| **Overview** | Subject header, counts, latest proof snapshot aggregate | Full reset lands here. |
| **Proofs** | Proof list, engine-driven outcome copy | **Clean proof** scenario switches here. |
| **Failures** | Failure locators, rail-scoped intro copy | **Failure** scenario switches here. |
| **Traceability** | Lineage / version continuity | **Version update** scenario switches here. |

**Subject perspective:** picker uses `DEMO_RAIL_OPTIONS` so you move between the five demo subjects when `subject_ids_by_rail` is present.

**Demo controls** (`frontend/src/app/components/proofs/DemoControls.tsx`):

- **Run Clean Proof** → targeted `demo_action: "clean_proof"`.
- **Run Failure** → `"failure"`.
- **Run Version Update** → `"version_update"`.
- **Reset demo** → full reset with curated template from `demo-curated.ts`.

Orchestration (`useDemoShellOrchestration`): mutation → refetch subject list → resolve subject id from `subject_ids_by_rail[demoRail]` (or stored map) → refetch subject-scoped queries → set tab → toast.

**Copy policy:** proof list and overview lines use helpers in `frontend/src/util/demo-proof-outcome.ts` and baseline cards use `frontend/src/util/demo-baseline-presentation.ts` so messaging tracks **engine status and angles**, not the button label alone.

---

## Explorer checklist (manual session log)

Use this as a printable walkthrough.

1. **Health:** From the dev stack, confirm `npm run dev:check` passes (or `/health` via the same base URL the UI uses).
2. **Sandbox session:** Enter sandbox; confirm `POST /sandbox/session` returns `sandbox: true` and testnet ids.
3. **Multi-rail seed:** Ensure template `demo_all_rails` (or full reset) completed; in the UI, confirm five subjects appear in the rail picker and `subject_ids_by_rail` in session storage has five keys.
4. **Per rail (repeat):** Select rail → Overview shows expected event count after seed → **Clean Proof** → snapshot aggregate conformant if engine agrees → **Failure** → violated aggregate → **Version Update** → conformant aggregate and traceability shows two events / lineage progression.
5. **Consistency:** Run `node scripts/check-repo-integrity.mjs` after changing template lists; run backend `src/http/sandbox-targeted-demo-truth.test.ts` when touching demo payloads or baseline alignment.

---

## Automated verification (related)

| Command | What it covers |
|---------|----------------|
| `npx vitest run src/http/sandbox-targeted-demo-truth.test.ts` | For **each** demo rail: clean vs failure vs version outcomes on real pipeline + overview aggregate. |
| `npx vitest run src/http/sandbox-scenarios-all.test.ts` | Every template seeds without ingest error. |
| `npx vitest run src/http/sandbox-scenario-parity.test.ts` | Structural parity of overview for `clean_first_proof` vs normal ingest (shape only). |
| `npx vitest run src/http/sandbox-session-http.test.ts` | HTTP `/sandbox/session` and `/sandbox/reset` smoke tests. |
| `node scripts/check-repo-integrity.mjs` | Frontend ↔ backend template list, demo-curated subset, optional `APROOF/dist` parity. |
| `npm run verify` (repo root) | Full monorepo gate including APROOF tests, frontend build, integrity script. |

---

## Troubleshooting

- **Proxy / wrong API:** The UI should use root-relative API paths (`/auth`, `/subjects`, `/proofs`, `/health`) or a configured `VITE_API_BASE_URL`. If the Vite default proxy and `PORT` / `APROOF_PORT` disagree, `dev:stack` sets `VITE_API_PROXY_TARGET` explicitly; see the NOTE emitted by `check-repo-integrity.mjs`.
- **Stale backend behind proxy:** If new routes 404 through the proxy, stop listeners (`npm run stop:stack`) and restart from current source; see root `README.md`.
- **Template id errors:** 400 from `/sandbox/reset` usually means unknown `template` or invalid `demo_rail` / `demo_action` combination (targeted replay requires `template: "demo_all_rails"`).

---

## File index (quick navigation)

| Area | Path |
|------|------|
| Scenario runner | `APROOF/src/http/sandbox-scenario-runner.ts` |
| Demo payloads | `APROOF/src/demo/demo-clean-payloads.ts` |
| Sandbox baseline merge + effective time | `APROOF/src/demo/sandbox-rail-baseline-shapes.ts` |
| Subject subgraph delete | `APROOF/src/http/sandbox-env-reset.ts` |
| Overview aggregate | `APROOF/src/http/overview-read-model.ts` |
| Sandbox HTTP routes | `APROOF/src/http/server.ts` (`/sandbox/session`, `/sandbox/reset`) |
| Session JSON shape | `APROOF/src/http/sandbox-session-response.ts` |
| Frontend template labels | `frontend/src/constants/sandbox-scenarios.ts` |
| Demo rails order | `frontend/src/constants/demo-rails.ts` |
| Reset hook + actions | `frontend/src/hooks/useSandboxReset.ts`, `useDemoShellOrchestration.ts` |
| Subject id resolution | `frontend/src/util/sandbox-reset-subject-resolver.ts` |
| Proof shell page | `frontend/src/app/pages/Proofs.tsx` |

---

*Last aligned with repo behavior: multi-rail demo truth tests and `applySandboxRailBaselineShapes` effective-from handling for historical sandbox timestamps.*
