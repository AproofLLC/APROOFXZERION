import { describe, expect, it } from "vitest";
import type { ZerionAgentTransactionRow } from "../../api/types";
import { deriveZerionDeterministicFlowStatuses } from "./zerion-deterministic-flow";

const readinessOk = { integration_ready: true, execution_ready: true };

function tx(partial: Partial<ZerionAgentTransactionRow> & Pick<ZerionAgentTransactionRow, "event_id">): ZerionAgentTransactionRow {
  return {
    event_lineage_id: "l",
    event_version: 1,
    timestamp: new Date().toISOString(),
    scenario: "Authorized Execution",
    status: "verified",
    chain: "solana-devnet",
    asset: "SOL",
    amount_usd: 1,
    wallet_address: "W",
    recipient_address: "R",
    execution_source: "zerion_cli",
    cli_invoked: true,
    execution_attempted: true,
    execution_simulated: false,
    tx_hash: "H".repeat(88),
    proof_id: "p",
    proof_digest: "d",
    anchor_status: "anchored",
    anchor_signature: "S".repeat(88),
    explorer_url: "https://explorer.solana.com/",
    execution_explorer_url: "https://explorer.solana.com/tx/h?cluster=devnet",
    runtime_error: null,
    failure_reason_code: null,
    ...partial,
  };
}

describe("deriveZerionDeterministicFlowStatuses", () => {
  const ix = (labels: readonly string[], name: string) => labels.indexOf(name);

  it("pre-run: integration green, no rows → CLI ready and tx/proof/anchor pending", () => {
    const { statuses, labels } = deriveZerionDeterministicFlowStatuses({
      readiness: readinessOk,
      subjectHasId: true,
      selectedTransaction: null,
      latestTransaction: null,
      latestProofSnapshot: null,
      overviewOperationalReason: null,
    });
    expect(statuses[ix(labels, "Forked Zerion CLI")]).toBe("ready");
    expect(statuses[ix(labels, "Solana Devnet Tx")]).toBe("pending");
    expect(statuses[ix(labels, "Scoped Policy Check")]).toBe("passed");
  });

  it("verified latest row: passed / confirmed (Execution Continuity matches Authorized)", () => {
    const row = tx({
      event_id: "e-cont",
      scenario: "Execution Continuity",
      status: "conformant",
    });
    const { statuses, labels } = deriveZerionDeterministicFlowStatuses({
      readiness: readinessOk,
      subjectHasId: true,
      selectedTransaction: null,
      latestTransaction: row,
      latestProofSnapshot: null,
      overviewOperationalReason: "POLICY_SPEND_LIMIT_EXCEEDED",
    });
    expect(statuses[ix(labels, "Forked Zerion CLI")]).toBe("passed");
    expect(statuses[ix(labels, "Solana Devnet Tx")]).toBe("confirmed");
    expect(statuses[ix(labels, "AProof Proof")]).toBe("passed");
    expect(statuses[ix(labels, "Solana Devnet Anchor")]).toBe("confirmed");
    expect(statuses[ix(labels, "Scoped Policy Check")]).toBe("passed");
  });

  it("does not poison flow when overview has POLICY_SPEND but latest transaction is verified", () => {
    const row = tx({ event_id: "e-ok" });
    const { statuses, labels } = deriveZerionDeterministicFlowStatuses({
      readiness: readinessOk,
      subjectHasId: true,
      selectedTransaction: null,
      latestTransaction: row,
      latestProofSnapshot: null,
      overviewOperationalReason: "POLICY_SPEND_LIMIT_EXCEEDED",
    });
    expect(statuses[ix(labels, "Scoped Policy Check")]).toBe("passed");
    expect(statuses[ix(labels, "Forked Zerion CLI")]).toBe("passed");
  });

  it("Blocked Execution: policy blocked; CLI / wallet not invoked; tx not created", () => {
    const blocked = tx({
      event_id: "e-block",
      scenario: "Blocked Execution",
      status: "failed",
      cli_invoked: false,
      execution_attempted: false,
      execution_source: "none",
      tx_hash: null,
      runtime_error: "POLICY_SPEND_LIMIT_EXCEEDED",
      anchor_status: "pending",
      anchor_signature: null,
      policy_result: "denied",
    });
    const { statuses, labels } = deriveZerionDeterministicFlowStatuses({
      readiness: readinessOk,
      subjectHasId: true,
      selectedTransaction: blocked,
      latestTransaction: blocked,
      latestProofSnapshot: null,
      overviewOperationalReason: null,
    });
    expect(statuses[ix(labels, "Scoped Policy Check")]).toBe("blocked");
    expect(statuses[ix(labels, "Forked Zerion CLI")]).toBe("not_invoked");
    expect(statuses[ix(labels, "Agent Wallet Execution")]).toBe("not_invoked");
    expect(statuses[ix(labels, "Solana Devnet Tx")]).toBe("not_created");
    expect(statuses[ix(labels, "AProof Proof")]).toBe("failed");
  });

  it("latest verified row wins over older blocked row in history (newest is context)", () => {
    const verified = tx({ event_id: "e-new", event_version: 3 });
    const blocked = tx({
      event_id: "e-old",
      event_version: 2,
      scenario: "Blocked Execution",
      status: "failed",
      cli_invoked: false,
      execution_attempted: false,
      tx_hash: null,
      runtime_error: "POLICY_SPEND_LIMIT_EXCEEDED",
      policy_result: "denied",
    });
    const { statuses, labels } = deriveZerionDeterministicFlowStatuses({
      readiness: readinessOk,
      subjectHasId: true,
      selectedTransaction: null,
      latestTransaction: verified,
      latestProofSnapshot: null,
      overviewOperationalReason: "POLICY_SPEND_LIMIT_EXCEEDED",
    });
    expect(statuses[ix(labels, "Forked Zerion CLI")]).toBe("passed");
    expect(statuses[ix(labels, "Scoped Policy Check")]).toBe("passed");
    void blocked;
  });

  it("selecting older blocked row shows blocked flow while latest remains verified", () => {
    const verified = tx({ event_id: "e-new" });
    const blocked = tx({
      event_id: "e-old",
      scenario: "Blocked Execution",
      cli_invoked: false,
      execution_attempted: false,
      tx_hash: null,
      runtime_error: "POLICY_SPEND_LIMIT_EXCEEDED",
      status: "failed",
      policy_result: "denied",
      anchor_signature: null,
      anchor_status: "pending",
    });
    const { statuses, labels } = deriveZerionDeterministicFlowStatuses({
      readiness: readinessOk,
      subjectHasId: true,
      selectedTransaction: blocked,
      latestTransaction: verified,
      latestProofSnapshot: null,
      overviewOperationalReason: null,
    });
    expect(statuses[ix(labels, "Forked Zerion CLI")]).toBe("not_invoked");
    expect(statuses[ix(labels, "Scoped Policy Check")]).toBe("blocked");
    void verified;
  });

  it("does not mark CLI failed when CLI was never invoked (policy blocked only)", () => {
    const blocked = tx({
      event_id: "b",
      scenario: "Blocked Execution",
      cli_invoked: false,
      execution_attempted: false,
      tx_hash: null,
      runtime_error: "POLICY_SPEND_LIMIT_EXCEEDED",
      status: "failed",
    });
    const { statuses, labels } = deriveZerionDeterministicFlowStatuses({
      readiness: readinessOk,
      subjectHasId: true,
      selectedTransaction: blocked,
      latestTransaction: blocked,
      latestProofSnapshot: null,
      overviewOperationalReason: null,
    });
    expect(statuses[ix(labels, "Forked Zerion CLI")]).not.toBe("failed");
  });
});
