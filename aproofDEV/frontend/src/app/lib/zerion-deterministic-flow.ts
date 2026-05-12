import type { ZerionAgentTransactionRow } from "../../api/types";

/** Labels match the Zerion Agent “Deterministic flow” card (fixed order). */
export const ZERION_FLOW_STEP_LABELS = [
  "Execution Request",
  "Scoped Policy Check",
  "Execution Authorization",
  "Forked Zerion CLI",
  "Zerion API Route",
  "Agent Wallet Execution",
  "Solana Devnet Tx",
  "AProof Proof",
  "Solana Devnet Anchor",
] as const;

export type FlowStatus =
  | "ready"
  | "passed"
  | "blocked"
  | "missing"
  | "confirmed"
  | "failed"
  | "pending"
  | "not_invoked"
  | "not_created";

export function flowStatusDisplay(status: FlowStatus): string {
  if (status === "not_invoked") return "not invoked";
  if (status === "not_created") return "not created";
  return status;
}

export type ZerionFlowReadiness = {
  integration_ready?: boolean;
  execution_ready?: boolean;
};

export type LatestProofSnapshotInput = {
  status: string | null;
  zerion_tx_hash?: string | null;
  anchor_status?: string | null;
} | null;

function rowPolicySpendBlocked(row: ZerionAgentTransactionRow): boolean {
  if (row.runtime_error === "POLICY_SPEND_LIMIT_EXCEEDED") return true;
  if (row.failure_reason_code === "POLICY_SPEND_LIMIT_EXCEEDED") return true;
  const pr = row.policy_result?.trim().toLowerCase();
  if (pr === "denied") return true;
  if (row.scenario === "Blocked Execution" && row.cli_invoked !== true) return true;
  return false;
}

function integrationNotReadyBlocksOverview(
  overviewOperationalReason: string | null,
  /** When true, never use subject-wide operational failures for flow (row is source of truth). */
  hasTransactionContext: boolean,
): boolean {
  if (hasTransactionContext) return false;
  return overviewOperationalReason === "ZERION_INTEGRATION_NOT_READY";
}

function nonPolicyRuntimeError(row: ZerionAgentTransactionRow): boolean {
  const e = row.runtime_error?.trim();
  if (!e) return false;
  return e !== "POLICY_SPEND_LIMIT_EXCEEDED";
}

function proofConformant(row: ZerionAgentTransactionRow): boolean {
  const s = row.status?.trim().toLowerCase();
  return s === "verified" || s === "conformant";
}

function anchorOk(row: ZerionAgentTransactionRow): boolean {
  return (
    row.anchor_status === "anchored" &&
    Boolean(row.anchor_signature && row.anchor_signature.trim().length >= 32)
  );
}

/** Derive deterministic flow steps for the active execution context (selected row, else latest; never poisoned by historical overview failures). */
export function deriveZerionDeterministicFlowStatuses(params: {
  readiness: ZerionFlowReadiness | undefined;
  subjectHasId: boolean;
  /** Explicit user selection; omit when using “follow latest only”. */
  selectedTransaction: ZerionAgentTransactionRow | null;
  latestTransaction: ZerionAgentTransactionRow | null;
  latestProofSnapshot: LatestProofSnapshotInput;
  /** Subject-wide operational reason — only affects flow when there is no transaction row to interpret. */
  overviewOperationalReason: string | null;
}): { labels: readonly string[]; statuses: FlowStatus[] } {
  const labels = ZERION_FLOW_STEP_LABELS;
  const r = params.readiness;
  const intOk = r?.integration_ready === true;
  const execReady = r?.execution_ready === true;
  const hasSubject = params.subjectHasId;

  const contextTx = params.selectedTransaction ?? params.latestTransaction;
  const hasCtx = contextTx != null;
  const notReady = integrationNotReadyBlocksOverview(params.overviewOperationalReason, hasCtx);

  // No Zerion transaction rows: snapshot fallback, else readiness pre-run
  if (!contextTx) {
    const snap = params.latestProofSnapshot;
    const ztx = snap?.zerion_tx_hash?.trim();
    if (snap && ztx && ztx.length >= 32) {
      const st = snap.status?.trim().toLowerCase();
      const snapProofOk = st === "conformant" || st === "verified";
      if (snapProofOk) {
        const anchorConfirmed = snap.anchor_status === "anchored";
        const s: FlowStatus[] = [
          hasSubject ? "ready" : "missing",
          hasSubject ? "passed" : "missing",
          notReady ? "blocked" : intOk || execReady ? "passed" : execReady ? "ready" : "missing",
          "passed",
          "passed",
          "confirmed",
          "confirmed",
          "passed",
          anchorConfirmed ? "confirmed" : "pending",
        ];
        return { labels, statuses: s };
      }
    }

    const txsEmpty = true;
    const policyBlockedOverview =
      !hasCtx && params.overviewOperationalReason === "POLICY_SPEND_LIMIT_EXCEEDED";
    const preRunBlocked = policyBlockedOverview || notReady;
    const preRunGreen = txsEmpty && intOk && !preRunBlocked;

    if (preRunGreen) {
      const s: FlowStatus[] = [
        hasSubject ? "ready" : "missing",
        hasSubject ? "passed" : "missing",
        intOk || execReady ? "passed" : execReady ? "ready" : "missing",
        "ready",
        "ready",
        "ready",
        "pending",
        "pending",
        "pending",
      ];
      return { labels, statuses: s };
    }

    const s: FlowStatus[] = [];
    s.push(hasSubject ? "ready" : "missing");
    s.push(preRunBlocked ? "blocked" : hasSubject ? "passed" : "missing");
    s.push(preRunBlocked ? "blocked" : notReady ? "blocked" : intOk || execReady ? "passed" : execReady ? "ready" : "missing");
    s.push(preRunBlocked || notReady ? "blocked" : intOk ? "missing" : "missing");
    s.push(preRunBlocked || notReady ? "blocked" : intOk ? "ready" : "missing");
    s.push(preRunBlocked || notReady ? "blocked" : "missing");
    s.push(preRunBlocked || notReady ? "blocked" : "pending");
    s.push(preRunBlocked || notReady ? "blocked" : "pending");
    s.push(preRunBlocked || notReady ? "blocked" : "pending");
    return { labels, statuses: s };
  }

  const row = contextTx;
  const policyBlocked = rowPolicySpendBlocked(row);
  const hasTx = Boolean(row.tx_hash && row.tx_hash.trim().length >= 32);
  const cliOk =
    row.cli_invoked === true &&
    (row.execution_source === "zerion_cli" || row.execution_source === "zerion_cli_stub");
  const proofOk = proofConformant(row);
  const anchorConfirmed = anchorOk(row);
  const anchorFailed = row.anchor_status === "anchor_failed";

  const runtimeFail = nonPolicyRuntimeError(row);
  const txMissingAfterCliAttempt =
    !policyBlocked &&
    row.cli_invoked === true &&
    row.execution_attempted === true &&
    !hasTx;

  const cliExecFailed = runtimeFail || txMissingAfterCliAttempt;

  // Policy blocked before CLI — execution steps are not invoked / not created, not “failed”.
  if (policyBlocked) {
    const anchorStep: FlowStatus = anchorFailed ? "failed" : anchorConfirmed ? "confirmed" : "pending";
    const s: FlowStatus[] = [
      hasSubject ? "ready" : "missing",
      "blocked",
      "blocked",
      "not_invoked",
      "not_invoked",
      "not_invoked",
      "not_created",
      "failed",
      anchorStep,
    ];
    return { labels, statuses: s };
  }

  const s: FlowStatus[] = [];
  s.push(hasSubject ? "ready" : "missing");
  s.push(hasSubject ? "passed" : "missing");
  s.push(intOk || execReady ? "passed" : execReady ? "ready" : "missing");
  s.push(
    cliExecFailed ? "failed" : cliOk ? "passed" : intOk ? "failed" : "missing",
  );
  s.push(cliExecFailed ? "failed" : cliOk ? "passed" : intOk ? "ready" : "missing");
  s.push(cliExecFailed ? "failed" : hasTx ? "confirmed" : cliOk ? "failed" : "missing");
  s.push(cliExecFailed ? "missing" : hasTx ? "confirmed" : "missing");
  s.push(cliExecFailed ? "failed" : proofOk ? "passed" : row ? "failed" : "missing");
  s.push(
    anchorFailed ? "failed" : anchorConfirmed ? "confirmed" : hasTx ? "ready" : "missing",
  );

  return { labels, statuses: s };
}
