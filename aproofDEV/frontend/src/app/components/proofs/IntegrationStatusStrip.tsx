import type { IntegrationStatus } from "../../../hooks/useIntegrationStatus";
import { useSession } from "../../../hooks/useSession";
import { Badge } from "../ui/badge";

function pill(ok: boolean, readyLabel: string, missingLabel: string) {
  return (
    <Badge variant={ok ? "default" : "secondary"} className="text-xs font-normal">
      {ok ? readyLabel : missingLabel}
    </Badge>
  );
}

function shortId(id: string | undefined, n = 8) {
  if (!id) return "—";
  return id.length <= n ? id : `${id.slice(0, n)}…`;
}

/**
 * Real backend read model (GET /subjects/:id/integration-status) + session context.
 * Stale UI after a settings change is prevented by mutators invalidating the same query keys
 * (see `invalidateControlPlaneForSubject`); this strip always reflects refetched data.
 */
export function IntegrationStatusStrip({ s, loading }: { s: IntegrationStatus | undefined; loading: boolean }) {
  const sessionQ = useSession();

  if (loading || !s) {
    return (
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground border border-dashed border-border rounded-lg px-3 py-2">
        Loading integration &amp; environment status…
      </div>
    );
  }

  const mappingLabel = !s.mapping_ready ? "Missing" : s.mapping_is_default_only ? "Default" : "Ready";
  const env = sessionQ.data;
  const ar = s.anchor_readout;
  const route = ar?.route ?? ar?.default_chain_name ?? "—";
  const cluster = ar?.cluster ?? "—";
  const pendingQ = ar?.pending_queued_count ?? s.anchor_state_summary.queued;
  const tx = ar?.latest_batch?.tx_signature;
  const ext = ar?.latest_batch?.external_attested;

  return (
    <div className="space-y-2 text-xs border border-border rounded-lg px-3 py-3 bg-muted/20">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground font-medium">Control plane</span>
        <span className="text-muted-foreground/80">|</span>
        <span className="text-muted-foreground">Integration</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Baselines</span>
          {pill(s.baselines_ready, "Ready", "Missing")}
          <span className="text-muted-foreground">Mapping</span>
          <Badge variant="outline" className="text-xs font-normal">
            {mappingLabel}
          </Badge>
          <span className="text-muted-foreground">API key</span>
          {pill(s.api_key_present, "Present", "Missing")}
        </div>
        {env ? (
          <>
            <span className="w-px h-4 bg-border hidden sm:block" />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-muted-foreground">Environment</span>
              <Badge variant="secondary" className="text-xs font-normal font-mono">
                {env.environment_mode}
              </Badge>
              <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[14rem]" title={env.environment}>
                {env.environment}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground" title={env.environment_id}>
                id {shortId(env.environment_id, 8)}
              </span>
            </div>
          </>
        ) : null}
        <span className="w-px h-4 bg-border hidden sm:block" />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground">Anchor route</span>
          <span className="font-mono text-[11px]">route {route}</span>
          <span className="font-mono text-[10px] text-muted-foreground" title={cluster}>
            {cluster}
          </span>
          <span className="font-mono text-[11px]">pending {pendingQ}</span>
          <span
            className="font-mono text-[10px] text-muted-foreground"
            title={tx && tx.length > 0 ? `Transaction signature: ${tx}` : "No transaction yet"}
          >
            tx {tx ? shortId(tx, 10) : "—"}
          </span>
          <span
            className="font-mono text-[10px] text-muted-foreground"
            title="External on-chain attestation in this environment"
          >
            ext {ext ? "on" : "off"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground border-t border-border/60 pt-2">
        <span>last event: {s.last_event_at ?? "—"}</span>
        <span>last proof: {s.last_proof_at ?? "—"}</span>
        {s.last_failure_at ? <span className="text-destructive/90">last failure: {s.last_failure_at}</span> : null}
        <span className="w-px h-3 bg-border hidden md:inline-block align-middle" />
        <span>
          unit lifecycle (q/b/s/c/f){" "}
          {s.anchor_state_summary.queued}/{s.anchor_state_summary.batched}/{s.anchor_state_summary.submitted}/
          {s.anchor_state_summary.confirmed}/{s.anchor_state_summary.failed}
        </span>
      </div>
    </div>
  );
}
