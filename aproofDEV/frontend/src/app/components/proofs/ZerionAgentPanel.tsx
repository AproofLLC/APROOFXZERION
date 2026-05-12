import { useEffect, useMemo, useRef, useState } from "react";
import { getOperationalOnlySixOfSevenCopy } from "../../../util/demo-proof-outcome";
import type { ZerionAgentSummaryResponse, ZerionAgentTransactionRow } from "../../../api/types";
import { shortHash } from "../../../api/anchor-metadata";
import { zerionExecutionExplorerUrlFromTxHash as clientExecutionExplorerUrl } from "../../../api/zerion-execution-explorer-url";
import {
  deriveZerionDeterministicFlowStatuses,
  flowStatusDisplay,
  type FlowStatus,
} from "../../lib/zerion-deterministic-flow";
import { useOverview } from "../../../hooks/useOverview";
import { useZerionAgentSummary } from "../../../hooks/useZerionAgentSummary";
import { QuerySectionError } from "../QuerySectionError";
import { LoadingState } from "../ui/loading-state";
import { Button } from "../ui/button";
import { TruthRow, TruthSection, truthScalar } from "./truth-display";

export type { FlowStatus };

const JUDGE_COPY =
  "Zerion provides wallet execution through the forked CLI and API route. AProof provides deterministic policy governance, execution integrity, failure localization, proof generation, and Solana devnet anchoring for every agent action.";

const TX_SEPARATION_COPY =
  "The Zerion Agent executes the autonomous transaction. AProof independently anchors the resulting deterministic proof/root hash to Solana devnet.";

function flowRowClass(s: FlowStatus): string {
  switch (s) {
    case "passed":
    case "confirmed":
    case "ready":
      return "text-foreground";
    case "blocked":
    case "failed":
      return "text-destructive";
    case "missing":
    case "pending":
    case "not_invoked":
    case "not_created":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

function formatStep(label: string, status: FlowStatus): string {
  return `${label} — ${flowStatusDisplay(status)}`;
}

/** @deprecated Prefer deriveZerionDeterministicFlowStatuses — wrapper for tests using latest row only */
export function deriveFlowStatuses(
  summary: ZerionAgentSummaryResponse | undefined,
  overviewOperationalReason: string | null,
): { labels: readonly string[]; statuses: FlowStatus[] } {
  return deriveZerionDeterministicFlowStatuses({
    readiness: summary?.readiness,
    subjectHasId: Boolean(summary?.subject?.subject_id),
    selectedTransaction: null,
    latestTransaction: summary?.transactions?.[0] ?? null,
    latestProofSnapshot: null,
    overviewOperationalReason,
  });
}

export function ZerionAgentPanel({ subjectId }: { subjectId: string }) {
  const overviewQ = useOverview(subjectId);
  const summaryQ = useZerionAgentSummary(subjectId, true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const prevHeadEventIdRef = useRef<string | null>(null);

  const demoOperationalReason =
    overviewQ.data?.active_failures_list?.find((f) => f.angle === "operational_integrity")?.reason_code ?? null;

  useEffect(() => {
    prevHeadEventIdRef.current = null;
    setSelectedId(null);
  }, [subjectId]);

  const headEventId = summaryQ.data?.transactions?.[0]?.event_id ?? null;
  useEffect(() => {
    if (headEventId == null) return;
    if (prevHeadEventIdRef.current !== headEventId) {
      prevHeadEventIdRef.current = headEventId;
      setSelectedId(headEventId);
    }
  }, [headEventId]);

  const flow = useMemo(
    () =>
      deriveZerionDeterministicFlowStatuses({
        readiness: summaryQ.data?.readiness,
        subjectHasId: Boolean(summaryQ.data?.subject?.subject_id),
        selectedTransaction:
          selectedId != null
            ? (summaryQ.data?.transactions ?? []).find((t) => t.event_id === selectedId) ?? null
            : null,
        latestTransaction: summaryQ.data?.transactions?.[0] ?? null,
        latestProofSnapshot: overviewQ.data?.latest_proof_snapshot
          ? {
              status: overviewQ.data.latest_proof_snapshot.status,
              zerion_tx_hash: overviewQ.data.latest_proof_snapshot.zerion_tx_hash,
              anchor_status: overviewQ.data.latest_proof_snapshot.anchor_status,
            }
          : null,
        overviewOperationalReason: demoOperationalReason,
      }),
    [summaryQ.data, overviewQ.data?.latest_proof_snapshot, selectedId, demoOperationalReason],
  );

  const sixOfSevenLine = useMemo(
    () => getOperationalOnlySixOfSevenCopy(overviewQ.data?.angles_summary),
    [overviewQ.data?.angles_summary],
  );

  if (summaryQ.isLoading || overviewQ.isLoading) {
    return <LoadingState message="Loading Zerion Agent…" />;
  }
  if (summaryQ.error || overviewQ.error) {
    return (
      <QuerySectionError
        error={(summaryQ.error ?? overviewQ.error) as Error}
        title="Zerion Agent panel unavailable"
      />
    );
  }
  const data = summaryQ.data;
  if (!data) {
    return <QuerySectionError error={new Error("Empty summary")} title="Zerion Agent panel unavailable" />;
  }

  const r = data.readiness;
  const txs = data.transactions ?? [];
  const selected: ZerionAgentTransactionRow | null =
    txs.find((t) => t.event_id === selectedId) ?? txs[0] ?? null;
  const headTx = selected ?? txs[0] ?? null;
  const showRealAnchoredCopy =
    Boolean(headTx) &&
    typeof headTx!.tx_hash === "string" &&
    headTx!.tx_hash.trim().length >= 32 &&
    headTx!.execution_source === "zerion_cli" &&
    headTx!.execution_simulated === false &&
    headTx!.anchor_status === "anchored";

  const notReadyBanner =
    !r.integration_ready &&
    "Execution layer incomplete — AProof policy/proof/anchor path is working, but live Zerion CLI execution is not configured.";

  return (
    <div className="max-w-4xl space-y-6">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Agent status</h2>
        <div className="text-xs text-muted-foreground space-y-1 leading-relaxed">
          <div>
            <span className="text-foreground font-medium">Zerion Agent</span> · subject type{" "}
            <span className="text-foreground">agent</span> · environment{" "}
            <span className="text-foreground">solana-devnet</span>
          </div>
          <TruthSection title="Wallet & readiness">
            <TruthRow label="Agent wallet (Zerion path)" value={truthScalar(r.agent_wallet_public_address)} />
            <TruthRow label="Anchor keypair public (AProof)" value={truthScalar(r.wallet_public_address)} />
            <TruthRow label="execution_readiness_blocker" value={truthScalar(r.execution_readiness_blocker)} />
            <TruthRow label="anchor_readiness_blocker" value={truthScalar(r.anchor_readiness_blocker)} />
            <TruthRow label="integration_readiness_blocker" value={truthScalar(r.integration_readiness_blocker)} />
            <TruthRow label="execution_ready" value={r.execution_ready ? "true" : "false"} />
            <TruthRow label="anchor_ready" value={r.anchor_ready ? "true" : "false"} />
            <TruthRow label="anchor_balance_ready" value={r.anchor_balance_ready ? "true" : "false"} />
            <TruthRow label="integration_ready" value={r.integration_ready ? "true" : "false"} />
            <TruthRow label="Zerion CLI stub path" value={r.zerion_cli_is_stub_path ? "true (local test stub)" : "false"} />
            <TruthRow label="allowed_chain" value={truthScalar(data.policies.allowed_chain)} />
            <TruthRow label="approved_assets" value={truthScalar(data.policies.approved_assets.join(", "))} />
            <TruthRow label="max_spend_usd" value={String(data.policies.max_spend_usd)} />
            <TruthRow
              label="solana_balance_sol (anchor wallet)"
              value={
                r.anchor_wallet_balance_unavailable
                  ? "unavailable — check SOLANA_RPC_URL or RPC rate limits"
                  : r.solana_balance_sol != null
                    ? String(r.solana_balance_sol)
                    : "—"
              }
            />
            <TruthRow
              label="execution wallet balance (SOL)"
              value={
                r.execution_wallet_balance_unavailable
                  ? "unavailable — check SOLANA_RPC_URL or RPC rate limits"
                  : r.agent_execution_wallet_balance_sol != null
                    ? String(r.agent_execution_wallet_balance_sol)
                    : "—"
              }
            />
          </TruthSection>
          <TruthSection title="Readiness checklist (env + files)">
            <TruthRow label="ZERION_API_KEY" value={r.readiness_detail.zerion_api_key} />
            <TruthRow label="SOLANA_RPC_URL" value={r.readiness_detail.solana_rpc_url} />
            <TruthRow label="ZERION_CLI / local executor" value={r.readiness_detail.zerion_cli} />
            <TruthRow label="ZERION_AGENT_WALLET_ADDRESS" value={r.readiness_detail.zerion_agent_wallet} />
            <TruthRow label="ZERION_AGENT_KEYPAIR file" value={r.readiness_detail.zerion_agent_keypair_file} />
            <TruthRow label="ANCHOR devnet gate" value={r.readiness_detail.anchor_devnet_gate} />
            <TruthRow label="SOLANA_KEYPAIR file" value={r.readiness_detail.solana_anchor_keypair_file} />
          </TruthSection>
        </div>
        <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
          <p className="text-foreground font-medium">What is working</p>
          <ul className="list-disc list-inside space-y-1">
            {(r.what_is_working ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-foreground font-medium pt-1">What is next / missing</p>
          <ul className="list-disc list-inside space-y-1">
            {(r.what_is_next ?? []).length === 0 ? (
              !r.integration_ready ? (
                <li>
                  Live Zerion CLI path, Zerion API key, funded execution wallet, and CLI output with tx_hash.
                </li>
              ) : (
                <li>Optional: swap in your forked Zerion API route while keeping the same argv/JSON contract.</li>
              )
            ) : (
              (r.what_is_next ?? []).map((line) => <li key={line}>{line}</li>)
            )}
          </ul>
          {r.set_execution_wallet_help ? (
            <p className="text-amber-800 dark:text-amber-200">{r.set_execution_wallet_help}</p>
          ) : null}
          {r.zerion_agent_keypair_help ? (
            <p className="text-amber-800 dark:text-amber-200">{r.zerion_agent_keypair_help}</p>
          ) : null}
          {r.fund_execution_wallet_help ? (
            <p className="text-amber-800 dark:text-amber-200">{r.fund_execution_wallet_help}</p>
          ) : null}
        </div>
        {!r.integration_ready ? <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">{notReadyBanner}</p> : null}
        {r.live_solana_devnet_execution_enabled ? (
          <p className="text-xs text-muted-foreground leading-relaxed">Live Solana devnet execution enabled.</p>
        ) : null}
        {r.local_devnet_executor_path_active && !r.zerion_cli_path_env_explicit ? (
          <p className="text-xs text-muted-foreground leading-relaxed">Local devnet execution path active.</p>
        ) : null}
        {showRealAnchoredCopy ? (
          headTx?.scenario === "Execution Continuity" ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Execution Continuity verified — same agent lineage, incremented event_version, traceable execution history.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Real Zerion Agent execution completed and anchored.
            </p>
          )
        ) : null}
        {sixOfSevenLine ? (
          <p className="text-xs text-muted-foreground leading-relaxed">{sixOfSevenLine}</p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Deterministic flow</h2>
        <ol className="list-decimal list-inside space-y-1.5 text-xs">
          {flow.labels.map((label, i) => (
            <li key={label} className={flowRowClass(flow.statuses[i] ?? "missing")}>
              {formatStep(label, flow.statuses[i] ?? "missing")}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-medium text-foreground">Scenario actions</h2>
        <p className="text-xs text-muted-foreground">
          Reuse Demo controls above. Mapping only — each button runs the same sandbox scenario as before.
        </p>
        <ul className="text-xs space-y-2 text-muted-foreground leading-relaxed">
          <li>
            <span className="text-foreground font-medium">Authorized Execution</span> — Policy passes, Zerion CLI executes,
            tx_hash is returned, AProof proves and anchors it.
          </li>
          <li>
            <span className="text-foreground font-medium">Blocked Execution</span> — Policy violation blocks execution before
            CLI invocation.
          </li>
          <li>
            <span className="text-foreground font-medium">Execution Continuity</span> — Same agent lineage, incremented
            event_version, traceable execution history.
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3 overflow-x-auto">
        <h2 className="text-sm font-medium text-foreground">Agent transactions</h2>
        {txs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No Zerion-scoped events yet for this subject.</p>
        ) : (
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="py-2 pr-3 font-medium">Scenario</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Chain</th>
                <th className="py-2 pr-3 font-medium">Asset</th>
                <th className="py-2 pr-3 font-medium">Amt</th>
                <th className="py-2 pr-3 font-medium">Recipient</th>
                <th className="py-2 pr-3 font-medium">tx_hash</th>
                <th className="py-2 pr-3 font-medium">Runtime</th>
                <th className="py-2 pr-3 font-medium">Digest</th>
                <th className="py-2 pr-3 font-medium">Anchor</th>
                <th className="py-2 pr-3 font-medium">Explorer</th>
                <th className="py-2 pr-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => {
                const execHref = t.execution_explorer_url?.trim() || clientExecutionExplorerUrl(t.tx_hash);
                const anchorHref = t.explorer_url?.trim() || null;
                const anchorSig =
                  typeof t.anchor_signature === "string" && t.anchor_signature.trim().length >= 32
                    ? t.anchor_signature.trim()
                    : null;
                return (
                <tr key={t.event_id} className="border-b border-border/70 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(t.timestamp).toLocaleString()}</td>
                  <td className="py-2 pr-3">{t.scenario}</td>
                  <td className="py-2 pr-3">{t.status}</td>
                  <td className="py-2 pr-3">{t.chain}</td>
                  <td className="py-2 pr-3">{t.asset}</td>
                  <td className="py-2 pr-3">{t.amount_usd}</td>
                  <td className="py-2 pr-3 font-mono">
                    {t.recipient_address ? shortHash(t.recipient_address, 5, 5) : "—"}
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {t.tx_hash && t.tx_hash.trim().length >= 32 && execHref ? (
                      <a className="text-primary underline underline-offset-2" href={execHref} target="_blank" rel="noreferrer">
                        {shortHash(t.tx_hash.trim(), 6, 6)}
                      </a>
                    ) : (
                      "No execution tx yet."
                    )}
                  </td>
                  <td className="py-2 pr-3">{t.runtime_error ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono">{t.proof_digest ? shortHash(t.proof_digest, 6, 6) : "—"}</td>
                  <td className="py-2 pr-3 font-mono">
                    {anchorSig && anchorHref ? (
                      <a className="text-primary underline underline-offset-2" href={anchorHref} target="_blank" rel="noreferrer">
                        {shortHash(anchorSig, 6, 6)}
                      </a>
                    ) : anchorSig ? (
                      shortHash(anchorSig, 6, 6)
                    ) : (
                      t.anchor_status ?? "No proof anchor yet."
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {anchorHref ? (
                      <a className="text-primary underline underline-offset-2" href={anchorHref} target="_blank" rel="noreferrer">
                        link
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pl-2">
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setSelectedId(t.event_id)}>
                      Detail
                    </Button>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </section>

      {selected ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-medium text-foreground">Execution detail</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">{TX_SEPARATION_COPY}</p>
          <TruthSection title="Selected event">
            <TruthRow label="event_id" value={truthScalar(selected.event_id)} />
            <TruthRow label="event_lineage_id" value={truthScalar(selected.event_lineage_id)} />
            <TruthRow label="event_version" value={String(selected.event_version)} />
            <TruthRow
              label="subject_id"
              value={truthScalar(typeof data.subject.subject_id === "string" ? data.subject.subject_id : "")}
            />
            <TruthRow label="wallet_address" value={truthScalar(selected.wallet_address)} />
            <TruthRow label="recipient_address" value={truthScalar(selected.recipient_address)} />
            <TruthRow label="chain" value={truthScalar(selected.chain)} />
            <TruthRow label="asset" value={truthScalar(selected.asset)} />
            <TruthRow label="amount_usd" value={String(selected.amount_usd)} />
            <TruthRow label="execution_source" value={truthScalar(selected.execution_source)} />
            <TruthRow label="cli_invoked" value={selected.cli_invoked ? "true" : "false"} />
            <TruthRow label="execution_attempted" value={selected.execution_attempted ? "true" : "false"} />
            <TruthRow label="execution_simulated" value={selected.execution_simulated ? "true" : "false"} />
            <TruthRow
              label="tx_hash (execution)"
              value={
                typeof selected.tx_hash === "string" && selected.tx_hash.trim().length >= 32
                  ? truthScalar(selected.tx_hash)
                  : "No execution tx yet."
              }
            />
            <TruthRow
              label="Execution tx explorer"
              value={
                (() => {
                  const href =
                    selected.execution_explorer_url?.trim() || clientExecutionExplorerUrl(selected.tx_hash);
                  return href ? (
                    <a className="underline" href={href} target="_blank" rel="noreferrer">
                      {href}
                    </a>
                  ) : (
                    "—"
                  );
                })()
              }
            />
            <TruthRow label="proof_digest" value={truthScalar(selected.proof_digest)} />
            <TruthRow label="anchor_status" value={truthScalar(selected.anchor_status)} />
            <TruthRow
              label="anchor_signature (proof anchor)"
              value={
                typeof selected.anchor_signature === "string" && selected.anchor_signature.trim().length >= 32
                  ? truthScalar(selected.anchor_signature)
                  : "No proof anchor yet."
              }
            />
            <TruthRow
              label="Anchor proof explorer"
              value={
                selected.explorer_url?.trim() ? (
                  <a className="underline" href={selected.explorer_url.trim()} target="_blank" rel="noreferrer">
                    {selected.explorer_url.trim()}
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <TruthRow label="operational.runtime_error" value={truthScalar(selected.runtime_error)} />
            <TruthRow label="failure_locator.reason_code" value={truthScalar(selected.failure_reason_code)} />
          </TruthSection>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-2">
        <h2 className="text-sm font-medium text-foreground">Judge note</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">{JUDGE_COPY}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{TX_SEPARATION_COPY}</p>
      </section>
    </div>
  );
}
