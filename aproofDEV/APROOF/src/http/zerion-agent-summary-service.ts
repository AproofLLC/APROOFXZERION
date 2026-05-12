/**
 * Read-only aggregate for the Zerion Agent judge tab: subject + readiness + derived transactions.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { canonicalEvents, subjects } from "../db/schema/index.js";
import { buildZerionReadinessSnapshot } from "../zerion/zerion-readiness.js";
import { buildSubjectCoreBlock } from "./subject-assembler.js";
import { enrichSubjectTimestamps } from "./subject-service.js";
import { reconstructEventProofEnvelope } from "./reconstruct-proof-read.js";
import { finalizeEnvelopeProductProof } from "./proof-read-envelope.js";
import type { ProductProof } from "../product/product-proof.js";
import { zerionExecutionExplorerUrlFromTxHash } from "../zerion/zerion-execution-explorer-url.js";

export function readPolicyFieldsFromPayload(payload: unknown): {
  policy_result: string | null;
  policy_reason_code: string | null;
} {
  if (payload === null || typeof payload !== "object") {
    return { policy_result: null, policy_reason_code: null };
  }
  const pol = (payload as Record<string, unknown>).policy;
  if (pol === null || typeof pol !== "object" || Array.isArray(pol)) {
    return { policy_result: null, policy_reason_code: null };
  }
  const p = pol as Record<string, unknown>;
  const pr = p.policy_result;
  const prc = p.policy_reason_code;
  return {
    policy_result: typeof pr === "string" && pr.trim() ? pr.trim() : null,
    policy_reason_code: typeof prc === "string" && prc.trim() ? prc.trim() : null,
  };
}

export type ZerionAgentTransactionRow = {
  event_id: string;
  event_lineage_id: string;
  event_version: number;
  timestamp: string;
  scenario: string;
  status: string;
  chain: string;
  asset: string;
  amount_usd: number;
  wallet_address: string;
  recipient_address: string | null;
  execution_source: string;
  cli_invoked: boolean;
  execution_attempted: boolean;
  execution_simulated: boolean;
  tx_hash: string | null;
  proof_id: string | null;
  proof_digest: string;
  anchor_status: string | null;
  anchor_signature: string | null;
  explorer_url: string | null;
  /** Solana explorer for `tx_hash` (Zerion CLI execution), not the proof anchor. */
  execution_explorer_url: string | null;
  runtime_error: string | null;
  failure_reason_code: string | null;
  /** From canonical event `payload.policy` when present. */
  policy_result: string | null;
  policy_reason_code: string | null;
};

export type ZerionAgentSummaryResponse = {
  subject: Record<string, unknown>;
  readiness: Awaited<ReturnType<typeof buildZerionReadinessSnapshot>>;
  policies: {
    allowed_chain: string;
    max_spend_usd: number;
    approved_assets: string[];
  };
  transactions: ZerionAgentTransactionRow[];
};

function scenarioFromTrace(traceId: string): string {
  const t = traceId.toLowerCase();
  if (t.includes("zerion-replay-clean")) return "Authorized Execution";
  if (t.includes("zerion-fail")) return "Blocked Execution";
  if (t.includes("zerion-v1") || t.includes("zerion-v2")) return "Execution Continuity";
  return "Zerion Agent";
}

function readZerionObject(payload: unknown): Record<string, unknown> | null {
  if (payload === null || typeof payload !== "object") return null;
  const z = (payload as Record<string, unknown>).zerion;
  if (z === null || typeof z !== "object" || Array.isArray(z)) return null;
  return z as Record<string, unknown>;
}

function strField(z: Record<string, unknown>, k: string): string {
  const v = z[k];
  return typeof v === "string" ? v.trim() : "";
}

function numField(z: Record<string, unknown>, k: string, fallback: number): number {
  const v = z[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

function boolField(z: Record<string, unknown>, k: string): boolean {
  return z[k] === true;
}

function readTxHash(z: Record<string, unknown>): string | null {
  const th = z.tx_hash;
  if (typeof th !== "string") return null;
  const t = th.trim();
  if (t.length >= 32) return t;
  if (t.toLowerCase() === "null" || t === "") return null;
  return null;
}

export async function buildZerionAgentSummary(
  db: Db,
  params: {
    subjectId: string;
    organizationId: string;
    environmentId: string;
    environmentName: string;
  },
): Promise<ZerionAgentSummaryResponse | null> {
  const [subRow] = await db
    .select()
    .from(subjects)
    .where(
      and(
        eq(subjects.id, params.subjectId),
        eq(subjects.organizationId, params.organizationId),
        eq(subjects.environmentId, params.environmentId),
      ),
    )
    .limit(1);
  if (!subRow) return null;

  const ts = await enrichSubjectTimestamps(db, params.subjectId);
  const subjectHeader = buildSubjectCoreBlock(subRow, ts, params.environmentName);

  const readiness = await buildZerionReadinessSnapshot();
  const policies = {
    allowed_chain: readiness.allowed_chain,
    max_spend_usd: readiness.max_spend_usd,
    approved_assets: readiness.approved_assets,
  };

  const eventRows = await db
    .select({
      eventId: canonicalEvents.eventId,
      eventLineageId: canonicalEvents.eventLineageId,
      eventVersion: canonicalEvents.eventVersion,
      occurredAt: canonicalEvents.occurredAt,
      traceId: canonicalEvents.traceId,
      payload: canonicalEvents.payload,
    })
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.subjectId, params.subjectId),
        eq(canonicalEvents.organizationId, params.organizationId),
        eq(canonicalEvents.environmentId, params.environmentId),
        sql`${canonicalEvents.payload}::jsonb ? 'zerion'`,
      ),
    )
    .orderBy(desc(canonicalEvents.occurredAt), desc(canonicalEvents.eventId))
    .limit(50);

  const transactions: ZerionAgentTransactionRow[] = [];

  for (const row of eventRows) {
    const z = readZerionObject(row.payload);
    if (!z) continue;

    const traceId = typeof row.traceId === "string" ? row.traceId : "";
    const scenario = scenarioFromTrace(traceId);
    const chain = strField(z, "chain") || strField(z, "allowed_chain") || "solana-devnet";
    const asset = strField(z, "asset") || strField(z, "proposed_asset") || "SOL";
    const amountUsd = numField(z, "amount_usd", numField(z, "proposed_spend_usd", 1));
    const wallet = strField(z, "wallet_address");
    const recipient = strField(z, "recipient_address") || null;
    const execSource = strField(z, "execution_source") || "none";
    const txHash = readTxHash(z);

    let proofDigest = "";
    let proofId: string | null = null;
    let status = "unknown";
    let anchorStatus: string | null = null;
    let anchorSig: string | null = null;
    let explorerUrl: string | null = null;
    let runtimeError: string | null = null;
    let failureReason: string | null = null;
    const { policy_result: policyResult, policy_reason_code: policyReasonCode } =
      readPolicyFieldsFromPayload(row.payload);

    const rec = await reconstructEventProofEnvelope(db, {
      eventId: row.eventId,
      organizationId: params.organizationId,
      environmentId: params.environmentId,
    });
    if (rec?.ok) {
      finalizeEnvelopeProductProof(rec.envelope);
      const pp = rec.envelope.product_proof as ProductProof | undefined;
      if (pp && typeof pp === "object") {
        proofDigest = typeof pp.proof_digest === "string" ? pp.proof_digest : "";
        proofId = typeof pp.proof_id === "string" ? pp.proof_id : null;
        status = typeof pp.proof_status === "string" ? pp.proof_status : "unknown";
        anchorStatus = pp.anchor_status ?? null;
        anchorSig =
          typeof pp.anchor_tx_hash === "string" && pp.anchor_tx_hash.trim().length > 0
            ? pp.anchor_tx_hash.trim()
            : null;
        explorerUrl =
          typeof pp.anchor_explorer_url === "string" && pp.anchor_explorer_url.trim().length > 0
            ? pp.anchor_explorer_url.trim()
            : null;
        runtimeError =
          typeof pp.operational_runtime_error === "string" && pp.operational_runtime_error.trim().length > 0
            ? pp.operational_runtime_error.trim()
            : null;
        const fl = pp.failure_locator;
        if (fl && typeof fl === "object" && typeof fl.reason_code === "string") {
          failureReason = fl.reason_code.trim() || null;
        }
      }
    }

    transactions.push({
      event_id: row.eventId,
      event_lineage_id: row.eventLineageId,
      event_version: row.eventVersion,
      timestamp: row.occurredAt.toISOString(),
      scenario,
      status,
      chain,
      asset,
      amount_usd: amountUsd,
      wallet_address: wallet,
      recipient_address: recipient,
      execution_source: execSource,
      cli_invoked: boolField(z, "cli_invoked"),
      execution_attempted: boolField(z, "execution_attempted"),
      execution_simulated: boolField(z, "execution_simulated"),
      tx_hash: txHash,
      proof_id: proofId,
      proof_digest: proofDigest,
      anchor_status: anchorStatus,
      anchor_signature: anchorSig,
      explorer_url: explorerUrl,
      execution_explorer_url: zerionExecutionExplorerUrlFromTxHash(txHash),
      runtime_error: runtimeError,
      failure_reason_code: failureReason,
      policy_result: policyResult,
      policy_reason_code: policyReasonCode,
    });
  }

  return {
    subject: { ...subjectHeader } as unknown as Record<string, unknown>,
    readiness,
    policies,
    transactions,
  };
}
