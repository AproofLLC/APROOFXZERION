import { describe, expect, it } from "vitest";
import type { ZerionAgentSummaryResponse, ZerionAgentTransactionRow } from "../../../api/types";
import { deriveFlowStatuses } from "./ZerionAgentPanel";

function summaryWith(
  readiness: { integration_ready: boolean; execution_ready?: boolean },
  transactions: ZerionAgentTransactionRow[],
  subjectId: string | null = "00000000-0000-4000-8000-000000000099",
): ZerionAgentSummaryResponse {
  return {
    subject: subjectId ? { subject_id: subjectId } : {},
    readiness: {
      integration_ready: readiness.integration_ready,
      execution_ready: readiness.execution_ready ?? readiness.integration_ready,
    },
    policies: { allowed_chain: "solana-devnet", max_spend_usd: 5, approved_assets: ["SOL"] },
    transactions,
  } as ZerionAgentSummaryResponse;
}

describe("deriveFlowStatuses (Zerion Agent deterministic flow)", () => {
  it("pre-run: integration_ready with no transactions shows CLI/API/wallet ready — not failed; tx/proof/anchor pending", () => {
    const { statuses, labels } = deriveFlowStatuses(
      summaryWith({ integration_ready: true, execution_ready: true }, []),
      null,
    );
    const ix = (name: string) => labels.indexOf(name);
    expect(statuses[ix("Forked Zerion CLI")]).toBe("ready");
    expect(statuses[ix("Zerion API Route")]).toBe("ready");
    expect(statuses[ix("Agent Wallet Execution")]).toBe("ready");
    expect(statuses[ix("Solana Devnet Tx")]).toBe("pending");
    expect(statuses[ix("AProof Proof")]).toBe("pending");
    expect(statuses[ix("Solana Devnet Anchor")]).toBe("pending");
    expect(statuses[ix("Execution Request")]).toBe("ready");
    expect(statuses[ix("Scoped Policy Check")]).toBe("passed");
    expect(statuses[ix("Execution Authorization")]).toBe("passed");
  });

  it("pre-run: does not apply when integration_ready is false (CLI stays missing, not failed)", () => {
    const { statuses, labels } = deriveFlowStatuses(
      summaryWith({ integration_ready: false, execution_ready: false }, []),
      null,
    );
    const ix = (name: string) => labels.indexOf(name);
    expect(statuses[ix("Forked Zerion CLI")]).toBe("missing");
    expect(statuses[ix("Forked Zerion CLI")]).not.toBe("failed");
  });

  it("pre-run: does not apply when overview reports ZERION_INTEGRATION_NOT_READY", () => {
    const { statuses, labels } = deriveFlowStatuses(
      summaryWith({ integration_ready: true, execution_ready: true }, []),
      "ZERION_INTEGRATION_NOT_READY",
    );
    const ix = (name: string) => labels.indexOf(name);
    expect(statuses[ix("Execution Authorization")]).toBe("blocked");
    expect(statuses[ix("Forked Zerion CLI")]).toBe("blocked");
  });

  it("with a verified transaction: Forked Zerion CLI remains passed (unchanged success path)", () => {
    const txHash = "A".repeat(88);
    const row: ZerionAgentTransactionRow = {
      event_id: "e1",
      event_lineage_id: "l1",
      event_version: 1,
      timestamp: new Date().toISOString(),
      scenario: "demo",
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
      tx_hash: txHash,
      proof_id: "p1",
      proof_digest: "d".repeat(64),
      anchor_status: "anchored",
      anchor_signature: "B".repeat(88),
      explorer_url: "https://explorer.solana.com/",
      execution_explorer_url: `https://explorer.solana.com/tx/${txHash}?cluster=devnet`,
      runtime_error: null,
      failure_reason_code: null,
    };
    const { statuses, labels } = deriveFlowStatuses(
      summaryWith({ integration_ready: true, execution_ready: true }, [row]),
      null,
    );
    const ix = (name: string) => labels.indexOf(name);
    expect(statuses[ix("Forked Zerion CLI")]).toBe("passed");
    expect(statuses[ix("Solana Devnet Tx")]).toBe("confirmed");
    expect(statuses[ix("AProof Proof")]).toBe("passed");
    expect(statuses[ix("Solana Devnet Anchor")]).toBe("confirmed");
  });

  it("with runtime_error on latest row: downstream steps still surface failure (e.g. Agent Wallet / proof)", () => {
    const row = {
      event_id: "e1",
      event_lineage_id: "l1",
      event_version: 1,
      timestamp: new Date().toISOString(),
      scenario: "demo",
      status: "violated",
      chain: "solana-devnet",
      asset: "SOL",
      amount_usd: 1,
      wallet_address: "W",
      recipient_address: "R",
      execution_source: "zerion_cli",
      cli_invoked: true,
      execution_attempted: true,
      execution_simulated: false,
      tx_hash: null,
      proof_id: null,
      proof_digest: "",
      anchor_status: null,
      anchor_signature: null,
      explorer_url: null,
      execution_explorer_url: null,
      runtime_error: "ZERION_CLI_EXECUTION_FAILED",
      failure_reason_code: null,
    } as ZerionAgentTransactionRow;
    const { statuses, labels } = deriveFlowStatuses(
      summaryWith({ integration_ready: true, execution_ready: true }, [row]),
      null,
    );
    const ix = (name: string) => labels.indexOf(name);
    expect(statuses[ix("Agent Wallet Execution")]).toBe("failed");
    expect(statuses[ix("AProof Proof")]).toBe("failed");
  });
});
