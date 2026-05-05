import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { AnchorMvpReadout } from "../../../../hooks/useIntegrationStatus";
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { LoadingState } from "../../ui/loading-state";

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground font-normal">{label}</Label>
      <div
        className={
          mono
            ? "text-sm font-mono break-all rounded-md border border-border bg-muted/30 px-3 py-2"
            : "text-sm rounded-md border border-border bg-muted/30 px-3 py-2"
        }
      >
        {value}
      </div>
    </div>
  );
}

type AnchoringPanelProps = {
  readout: AnchorMvpReadout | undefined;
  /** Server summary slice (always present on integration response). */
  summary: { queued: number; batched: number; submitted: number; confirmed: number; failed: number };
  loading: boolean;
};

/** Control-plane exposure of server-provided anchoring state and latest batch metadata. */
export function AnchoringPanel({ readout, summary, loading }: AnchoringPanelProps) {
  if (loading) {
    return <LoadingState message="Loading anchoring state…" />;
  }

  if (!readout) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Anchoring details are not available from the API (upgrade the Aproof server). Lifecycle counts
        in the status strip still reflect proof unit states.
      </div>
    );
  }

  const lb = readout.latest_batch;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <p className="text-sm text-foreground leading-relaxed">
        Anchoring metadata is displayed exactly as returned by the backend. When mode is{" "}
        <span className="font-medium">solana-devnet</span>, this panel shows real Devnet transaction metadata.
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
        {readout.mvp_policy.description}
      </p>
      <div className="text-sm font-medium">Current mode: {readout.latest_batch?.anchor_mode ?? "unknown"}</div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Network family" value={readout.network_family ?? "Solana"} />
        <Field label="Route" value={readout.route ?? readout.default_chain_name} mono />
        <Field label="Cluster" value={readout.cluster ?? "sandbox-devnet"} mono />
        <Field
          label="Policy"
          value="Server-managed solana-sandbox batching — not editable in Settings"
        />
        <Field
          label="Simulated / unit lifecycle (this subject)"
          value={`q ${summary.queued} · batched ${summary.batched} · submitted ${summary.submitted} · sandbox-sealed (DB: confirmed) ${summary.confirmed} · failed ${summary.failed}`}
        />
        <Field label="Pending queue (not yet in a batch)" value={String(readout.pending_queued_count)} />
        <Field label="In batch, anchor pending (submitted / batched units)" value={String(readout.in_batch_pending_count)} />
      </div>
      {lb ? (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="text-sm font-medium">Latest anchor batch (this subject)</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Batch status (local row)" value={lb.status} />
            <Field label="Proofs in batch" value={String(lb.proof_count)} />
            <Field label="Route (stored)" value={lb.chain_name} mono />
            <Field label="Chain family" value={lb.chain_family} mono />
            <Field label="Cluster" value={lb.cluster} mono />
            <Field label="Confirmation status" value={lb.confirmation_status ?? "—"} />
            <Field label="Wallet public key" value={lb.wallet_public_key ?? "—"} mono />
            <Field label="Transaction signature" value={lb.tx_signature ?? "—"} mono />
            <Field
              label="External attestation"
              value={lb.external_attested ? "Enabled" : "Not enabled (sandbox; no on-chain ref yet)"}
            />
            <Field label="Explorer URL" value={lb.explorer_url ?? "—"} />
            {lb.anchored_at ? (
              <Field label="Sandbox route sealed (local timestamp)" value={new Date(lb.anchored_at).toLocaleString()} />
            ) : null}
            {lb.created_at ? <Field label="Created" value={new Date(lb.created_at).toLocaleString()} /> : null}
            {lb.anchor_payload ? (
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground font-normal">Anchor payload (commitment string)</Label>
                <div className="flex flex-wrap items-start gap-2">
                  <code className="text-xs font-mono break-all flex-1 min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2">
                    {lb.anchor_payload}
                  </code>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard.writeText(lb.anchor_payload!).then(() => toast.message("Copied payload"))
                    }
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs text-muted-foreground font-normal">Batch hash</Label>
              <div className="flex flex-wrap items-start gap-2">
                <code className="text-xs font-mono break-all flex-1 min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2">
                  {lb.batch_hash}
                </code>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void navigator.clipboard.writeText(lb.batch_hash).then(() => toast.message("Copied hash"))}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Field label="Root hash (MVP equals batch hash)" value={lb.root_hash} mono />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground border-t border-border pt-4">
          No <code className="font-mono text-xs">anchor_batches</code> row linked to this subject yet — proofs may
          still be queued for batching.
        </p>
      )}
    </div>
  );
}
