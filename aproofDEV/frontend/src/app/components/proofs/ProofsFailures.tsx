import { useEffect, useState } from "react";
import type { FailureDetail } from "../../../api/types";
import { ANGLE_LABELS } from "../../../constants/angle-display";
import { useFailure } from "../../../hooks/useFailure";
import { useFailures } from "../../../hooks/useFailures";
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
import { demoFailurePanelIntro } from "../../../util/demo-scenario-copy";
import { explainFailureReasonCode, summarizeUnknownForProduct } from "../../../util/proof-explanations";
import { TruthRow, truthJson, truthScalar } from "./truth-display";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function failureAngleLabel(angle: string | undefined): string {
  if (!angle) return "—";
  return ANGLE_LABELS[angle]?.title ?? angle;
}

export function ProofsFailures({
  subjectId,
  shellResetEpoch = 0,
  demoMode = false,
  demoRail = "system",
}: {
  subjectId: string;
  shellResetEpoch?: number;
  demoMode?: boolean;
  demoRail?: string;
}) {
  const listQ = useFailures(subjectId);
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
      if (prev && items.some((f) => f.failure_id === prev)) return prev;
      return items[0]!.failure_id;
    });
  }, [items]);

  const detailQ = useFailure(selectedId ?? undefined);
  const d = detailQ.data;

  if (listQ.isLoading) return <LoadingState message="Loading failures…" />;
  if (listQ.error) {
    return <QuerySectionError error={listQ.error as Error} title="Failures unavailable" />;
  }
  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 border border-border rounded-xl leading-relaxed">
        No failures detected. Either integrity checks passed or this subject has not been evaluated yet.
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6 min-h-[calc(100vh-12rem)]">
      <div className="space-y-4 overflow-hidden flex flex-col">
        <div>
          <h2 className="text-sm font-medium">Failures — what broke</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Angle, pipeline step, and reason first; open a row for full context and remediation hints.
          </p>
          {demoMode ? (
            <p className="text-[11px] text-muted-foreground/90 mt-2 max-w-xl leading-relaxed">
              {demoFailurePanelIntro(demoRail)}
            </p>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="text-xs">Baseline angle</TableHead>
                <TableHead className="text-xs">Stage</TableHead>
                <TableHead className="text-xs">Reason</TableHead>
                <TableHead className="text-xs">Event</TableHead>
                <TableHead className="text-xs">Proof</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((f) => (
                <TableRow
                  key={f.failure_id}
                  className={`cursor-pointer ${selectedId === f.failure_id ? "bg-accent" : "hover:bg-accent/50"}`}
                  onClick={() => setSelectedId(f.failure_id)}
                >
                  <TableCell className="text-xs">{failureAngleLabel(typeof f.angle === "string" ? f.angle : undefined)}</TableCell>
                  <TableCell className="text-xs font-mono">{truthScalar(f.step)}</TableCell>
                  <TableCell className="text-xs leading-snug max-w-[200px]">
                    {explainFailureReasonCode(typeof f.reason_code === "string" ? f.reason_code : "UNKNOWN").label}
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">{truthScalar(f.event_id)}</TableCell>
                  <TableCell className="text-xs font-mono break-all">{truthScalar(f.proof_id)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-4 overflow-hidden flex flex-col min-h-0">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center p-6 rounded-xl border border-border text-sm text-muted-foreground">
            Select a failure to inspect details.
          </div>
        ) : detailQ.isLoading ? (
          <LoadingState message="Loading failure detail…" />
        ) : detailQ.error ? (
          <QuerySectionError error={detailQ.error as Error} title="Failure detail unavailable" />
        ) : !d ? (
          <div className="text-sm text-muted-foreground">No failure detail available.</div>
        ) : (
          <FailureDetailBody d={d} />
        )}
      </div>
    </div>
  );
}

function FailureDetailBody({ d }: { d: FailureDetail }) {
  const fo = asRecord(d.failure_overview);
  const chain = asRecord((d as Record<string, unknown>).full_trace_chain);
  const rc = typeof fo.reason_code === "string" ? fo.reason_code : "";
  const explained = explainFailureReasonCode(rc || "UNKNOWN");
  const ffc = d.failed_field_condition;
  const angleH = failureAngleLabel(typeof d.angle === "string" ? d.angle : undefined);
  const expectedSummary = summarizeUnknownForProduct(d.expected_baseline);
  const observedSummary = summarizeUnknownForProduct(d.actual_observed);

  return (
    <div className="flex-1 overflow-y-auto p-4 rounded-xl border border-border bg-card space-y-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Failure detail</h3>
      <div className="rounded-lg border border-border/80 bg-muted/25 p-3 text-sm space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Plain summary</p>
        <p className="text-sm text-foreground leading-relaxed">
          <span className="font-medium">{angleH}</span> did not satisfy the active baseline for this event. The engine
          recorded: {explained.label.toLowerCase()}.
        </p>
        {typeof fo.detail === "string" && fo.detail.trim() !== "" ? (
          <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/60 pt-2 mt-1">
            {fo.detail}
          </p>
        ) : null}
      </div>
      {(expectedSummary || observedSummary) && (
        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          {expectedSummary ? (
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <p className="font-medium text-muted-foreground mb-1">What the baseline expected</p>
              <p className="text-foreground/90 leading-relaxed break-words">{expectedSummary}</p>
            </div>
          ) : null}
          {observedSummary ? (
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <p className="font-medium text-muted-foreground mb-1">What was observed</p>
              <p className="text-foreground/90 leading-relaxed break-words">{observedSummary}</p>
            </div>
          ) : null}
        </div>
      )}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm space-y-1">
        <div className="font-medium text-foreground">{explained.label}</div>
        <p className="text-xs text-muted-foreground leading-relaxed">{explained.fix}</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/15 p-3 space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Locator</p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Angle</dt>
            <dd className="font-medium mt-0.5">{truthScalar(fo.angle)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Stage</dt>
            <dd className="font-medium mt-0.5">{truthScalar(fo.step)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Reason code</dt>
            <dd className="font-mono text-[11px] mt-0.5 break-all">{truthScalar(fo.reason_code)}</dd>
          </div>
          {typeof fo.detail === "string" && fo.detail.trim() !== "" ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Detail</dt>
              <dd className="mt-0.5 leading-relaxed">{fo.detail}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      {ffc !== undefined && ffc !== null ? (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Missing or mismatched fields
          </p>
          <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto max-h-36 overflow-y-auto">
            {truthJson(ffc)}
          </pre>
        </div>
      ) : null}
      <TruthRow label="Severity" value={truthScalar(fo.severity)} />
      <TruthRow label="failure_id" value={truthScalar(fo.failure_id)} />
      <details className="rounded-lg border border-border/80 bg-background/40 text-xs group">
        <summary className="cursor-pointer list-none px-3 py-2 font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          Technical detail
        </summary>
        <div className="px-3 pb-3 space-y-3 border-t border-border/60 pt-3">
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">full_trace_chain</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto max-h-40 overflow-y-auto">
              {truthJson(Object.keys(chain).length ? chain : null)}
            </pre>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">expected_baseline</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto max-h-32 overflow-y-auto">
              {truthJson(d.expected_baseline)}
            </pre>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">actual_observed</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto max-h-32 overflow-y-auto">
              {truthJson(d.actual_observed)}
            </pre>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">related_event_refs</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto">{truthJson(d.related_event_refs)}</pre>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">related_proof_refs</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto">{truthJson(d.related_proof_refs)}</pre>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">metadata</div>
            <pre className="p-2 rounded bg-muted/30 text-[11px] overflow-x-auto">{truthJson(d.metadata)}</pre>
          </div>
        </div>
      </details>
    </div>
  );
}
