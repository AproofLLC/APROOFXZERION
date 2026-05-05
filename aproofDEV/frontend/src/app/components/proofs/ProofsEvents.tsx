import { useEffect, useState } from "react";
import { useEvent } from "../../../hooks/useEvent";
import { useEvents } from "../../../hooks/useEvents";
import { QuerySectionError } from "../QuerySectionError";
import { LoadingState } from "../ui/loading-state";
import { Separator } from "../ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { TruthRow, truthJson, truthScalar, formatLocalDateTime } from "./truth-display";

export function ProofsEvents({ subjectId }: { subjectId: string }) {
  const listQ = useEvents(subjectId);
  const items = listQ.data?.items ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && items.some((e) => e.event_id === prev)) return prev;
      return items[0]!.event_id;
    });
  }, [items]);

  const detailQ = useEvent(selectedId ?? undefined);
  const d = detailQ.data;

  if (listQ.isLoading) return <LoadingState message="Loading events…" />;
  if (listQ.error) {
    return <QuerySectionError error={listQ.error as Error} title="Events unavailable" />;
  }
  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 border border-border rounded-xl leading-relaxed">
        No data yet. Events appear here after ingest. In production, connect your pipeline; in Demo mode, use Demo
        controls to load a scenario.
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6 h-[calc(100vh-12rem)]">
      <div className="space-y-4 overflow-hidden flex flex-col">
        <div>
          <h2 className="text-sm font-medium">Events — ingestion trail</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            What entered the system, how it was canonicalized, and how it links to proofs—raw interpretation lives here,
            not in the Proofs tab.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="text-xs">event_id</TableHead>
                <TableHead className="text-xs">event_lineage_id</TableHead>
                <TableHead className="text-xs">event_version</TableHead>
                <TableHead className="text-xs">event_timestamp</TableHead>
                <TableHead className="text-xs">artifact_id</TableHead>
                <TableHead className="text-xs">canonical_hash</TableHead>
                <TableHead className="text-xs">source_type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((event) => (
                <TableRow
                  key={event.event_id}
                  className={`cursor-pointer ${selectedId === event.event_id ? "bg-accent" : "hover:bg-accent/50"}`}
                  onClick={() => setSelectedId(event.event_id)}
                >
                  <TableCell className="font-mono text-xs break-all">{truthScalar(event.event_id)}</TableCell>
                  <TableCell className="font-mono text-xs break-all">{truthScalar(event.event_lineage_id)}</TableCell>
                  <TableCell className="text-xs font-mono">{truthScalar(event.version)}</TableCell>
                  <TableCell className="text-xs tabular-nums break-words">{formatLocalDateTime(event.timestamp)}</TableCell>
                  <TableCell className="font-mono text-xs break-all">{truthScalar(event.artifact_id)}</TableCell>
                  <TableCell className="font-mono text-xs break-all">{truthScalar(event.canonical_hash)}</TableCell>
                  <TableCell className="text-xs font-mono">{truthScalar(event.source_type)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-4 overflow-hidden flex flex-col min-h-0">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center p-6 rounded-xl border border-border text-sm text-muted-foreground">
            No data
          </div>
        ) : detailQ.isLoading ? (
          <LoadingState message="Loading…" />
        ) : detailQ.error ? (
          <QuerySectionError error={detailQ.error as Error} title="Event detail unavailable" />
        ) : !d ? (
          <div className="text-sm text-muted-foreground">No data</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 rounded-xl border border-border bg-card space-y-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase">Event detail</h3>
            <TruthRow label="canonical_event_type" value={truthScalar(d.canonical_event_type)} />
            <TruthRow label="occurred_at · local" value={formatLocalDateTime(d.occurred_at)} />
            <TruthRow label="occurred_at · ISO-8601" value={truthScalar(d.occurred_at)} />
            <TruthRow label="lineage_id" value={truthScalar(d.lineage_id)} />
            <TruthRow label="source_type" value={truthScalar(d.source_type)} />
            <Separator />
            <p className="text-xs font-medium text-muted-foreground">Identity &amp; linkage</p>
            <TruthRow label="event_id" value={truthScalar(d.event_id)} />
            <TruthRow label="subject_id" value={truthScalar(d.subject_id)} />
            <TruthRow label="artifact_id" value={truthScalar(d.artifact_id)} />
            <Separator />
            <div className="text-xs text-muted-foreground">linked_proof_refs</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto">{truthJson(d.linked_proof_refs)}</pre>
            <div className="text-xs text-muted-foreground">related_failure_refs</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto">{truthJson(d.related_failure_refs)}</pre>
            <div className="text-xs text-muted-foreground">identity_resolution</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto max-h-40 overflow-y-auto">
              {truthJson(d.identity_resolution)}
            </pre>
            <div className="text-xs text-muted-foreground">lineage_assignment</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto">{truthJson(d.lineage_assignment)}</pre>
            <div className="text-xs text-muted-foreground">state_hashes</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto">{truthJson(d.state_hashes)}</pre>
            <div className="text-xs text-muted-foreground">linked_proof</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto">{truthJson(d.linked_proof)}</pre>
            <div className="text-xs text-muted-foreground">pipeline_metadata</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto max-h-40 overflow-y-auto">
              {truthJson(d.pipeline_metadata)}
            </pre>
            <div className="text-xs text-muted-foreground">metadata</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto max-h-32 overflow-y-auto">
              {truthJson(d.metadata)}
            </pre>
            <p className="text-xs font-medium text-muted-foreground pt-2">Raw &amp; canonical payloads (advanced)</p>
            <div className="text-xs text-muted-foreground">canonicalized_representation</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto max-h-40 overflow-y-auto">
              {truthJson(d.canonicalized_representation)}
            </pre>
            <div className="text-xs text-muted-foreground">raw_payload</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto max-h-40 overflow-y-auto">
              {truthJson(d.raw_payload)}
            </pre>
            <div className="text-xs text-muted-foreground">canonical_form</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto max-h-40 overflow-y-auto">
              {truthJson(d.canonical_form)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
