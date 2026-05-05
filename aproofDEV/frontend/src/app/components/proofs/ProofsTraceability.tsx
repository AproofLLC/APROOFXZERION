import { useEffect, useMemo, useState } from "react";
import { useIntegrationStatus } from "../../../hooks/useIntegrationStatus";
import { useLineage } from "../../../hooks/useLineage";
import { useLineages } from "../../../hooks/useLineages";
import { useProof } from "../../../hooks/useProof";
import { QuerySectionError } from "../QuerySectionError";
import { LoadingState } from "../ui/loading-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { IntegrationStatusStrip } from "./IntegrationStatusStrip";
import { demoTraceabilityIntro } from "../../../util/demo-scenario-copy";
import { formatLocalDateTime, truthScalar } from "./truth-display";
import { ProofAnchorMetadataSection } from "./proof-anchor-metadata-section";

export function ProofsTraceability({
  subjectId,
  demoMode = false,
  shellResetEpoch = 0,
}: {
  subjectId: string;
  demoMode?: boolean;
  shellResetEpoch?: number;
}) {
  const intQ = useIntegrationStatus(subjectId);
  const listQ = useLineages(subjectId);
  const items = listQ.data?.items ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(null);
  }, [subjectId, shellResetEpoch]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && items.some((l) => l.lineage_id === prev)) return prev;
      return items[0]!.lineage_id;
    });
  }, [items]);

  const detailQ = useLineage(selectedId ?? undefined);
  const d = detailQ.data;

  const timeline = useMemo(() => {
    if (!d) return [];
    const t = d.version_timeline ?? d.ordered_event_sequence ?? [];
    return [...t].sort((a, b) => a.version - b.version);
  }, [d]);

  if (listQ.isLoading) return <LoadingState message="Loading lineages…" />;
  if (listQ.error) {
    return <QuerySectionError error={listQ.error as Error} title="Lineages unavailable" />;
  }
  if (items.length === 0) {
    return (
      <div className="space-y-4">
        {!demoMode ? <IntegrationStatusStrip s={intQ.data} loading={intQ.isLoading} /> : null}
        <div className="text-sm text-muted-foreground p-4 border border-border rounded-xl leading-relaxed">
          No lineage available yet. Ingest versioned events on a shared lineage, or run &quot;Run Version Update&quot; in
          Demo controls.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-[calc(100vh-12rem)]">
      {!demoMode ? <IntegrationStatusStrip s={intQ.data} loading={intQ.isLoading} /> : null}
      <div className="grid lg:grid-cols-2 gap-6 flex-1 min-h-0">
      <div className="space-y-4 overflow-hidden flex flex-col">
        <div>
          <h2 className="text-sm font-medium">{demoMode ? "Traceability — version progression" : "Lineage — version story"}</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
            {demoMode
              ? demoTraceabilityIntro()
              : "Each lineage is a sequence of event versions for one artifact; use the timeline to see how proofs attach across versions."}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="text-xs">event_lineage_id (lineage_id)</TableHead>
                <TableHead className="text-xs">version_count</TableHead>
                <TableHead className="text-xs">last_updated</TableHead>
                <TableHead className="text-xs">artifact_id</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((lineage) => (
                <TableRow
                  key={lineage.lineage_id}
                  className={`cursor-pointer ${selectedId === lineage.lineage_id ? "bg-accent" : "hover:bg-accent/50"}`}
                  onClick={() => setSelectedId(lineage.lineage_id)}
                >
                  <TableCell className="font-mono text-xs break-all">{truthScalar(lineage.lineage_id)}</TableCell>
                  <TableCell className="text-xs font-mono">{truthScalar(lineage.version_count)}</TableCell>
                  <TableCell className="text-xs tabular-nums break-words">{formatLocalDateTime(lineage.last_updated)}</TableCell>
                  <TableCell className="font-mono text-xs break-all">{truthScalar(lineage.artifact_id)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-4 overflow-hidden flex flex-col min-h-0">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center p-6 rounded-xl border border-border text-sm text-muted-foreground">
            Select a lineage to view progression.
          </div>
        ) : detailQ.isLoading ? (
          <LoadingState message="Loading lineage…" />
        ) : detailQ.error ? (
          <QuerySectionError error={detailQ.error as Error} title="Lineage detail unavailable" />
        ) : !d ? (
          <div className="text-sm text-muted-foreground">No lineage detail available.</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 rounded-xl border border-border bg-card space-y-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lineage detail</h3>
            <div className="text-xs space-y-1 text-muted-foreground">
              <div>
                <span className="font-mono text-[11px] text-foreground">{truthScalar(d.lineage_id)}</span>
              </div>
              <div>
                Artifact <span className="font-mono text-[11px] text-foreground">{truthScalar(d.artifact_id)}</span>
              </div>
            </div>
            <div className="text-xs font-medium text-foreground pt-2">Governed version progression</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Same lineage id end-to-end: read top to bottom for version order; each step is a newer release of the same
              artifact. When a <span className="font-mono text-[10px]">proof_id</span> is present, the anchor block below
              it is loaded with the same <span className="font-mono text-[10px]">GET /proofs/:id</span> request as the Proofs
              tab, so batch, tx, and explorer links stay aligned.
            </p>
            {timeline.length === 0 ? (
              <div className="text-sm text-muted-foreground">No version steps in this lineage yet.</div>
            ) : (
              <ul className="space-y-0 border-l-2 border-primary/25 ml-2 pl-4">
                {timeline.map((v, i) => (
                  <li key={v.event_id} className="relative pb-6 last:pb-0">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary/80 ring-4 ring-background" />
                    <div className="text-[11px] font-semibold text-foreground">Version {truthScalar(v.version)}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                      {formatLocalDateTime(v.timestamp)}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground break-all mt-1">Event {v.event_id}</div>
                    {v.proof_id != null && v.proof_id !== "" ? (
                      <div className="font-mono text-[10px] text-foreground/90 break-all mt-1">
                        Proof {truthScalar(v.proof_id)}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground mt-1">No proof linked</div>
                    )}
                    {v.proof_id != null && v.proof_id !== "" ? (
                      <TraceabilityVersionProofAnchor proofId={v.proof_id} />
                    ) : null}
                    {i < timeline.length - 1 ? (
                      <div className="text-[10px] text-muted-foreground mt-2">Continues under same lineage →</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function safeRecord(obj: unknown): Record<string, unknown> {
  if (obj !== undefined && obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    return obj as Record<string, unknown>;
  }
  return {};
}

/** Uses the same React Query key as the Proofs tab — identical envelope and merge rules. */
function TraceabilityVersionProofAnchor({ proofId }: { proofId: string }) {
  const q = useProof(proofId);
  if (q.isLoading) {
    return <div className="text-[10px] text-muted-foreground mt-2">Loading anchor (same request as Proofs tab)…</div>;
  }
  if (q.isError) {
    return (
      <div className="text-[10px] text-destructive mt-2">
        Could not load proof envelope for this version. Open the Proofs tab and select this proof_id.
      </div>
    );
  }
  const detail = q.data;
  const pp = detail?.product_proof;
  const anchorMetadata = safeRecord(detail?.anchor_metadata);
  return (
    <div className="mt-3 rounded-lg border border-border/70 bg-muted/15 p-2">
      <ProofAnchorMetadataSection pp={pp} anchorMetadata={anchorMetadata} variant="inline" />
    </div>
  );
}
