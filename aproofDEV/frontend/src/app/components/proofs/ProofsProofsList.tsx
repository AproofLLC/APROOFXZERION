import { useEffect, useMemo, useState } from "react";
import type {
  EventListItem,
  ProofDetailEnvelope,
  ProofListItem,
  ProofListSummary,
  ProofVerificationResponse,
  ProductAngleResult,
  ProductProof,
} from "../../../api/types";
import { apiFetch } from "../../../api/client";
import { ProofAnchorMetadataSection } from "./proof-anchor-metadata-section";
import { SESSION_PENDING_PROOF_ID_KEY } from "../../../constants/storage-keys";
import { baselineUxState, explainAngleReasonCode } from "../../../util/proof-explanations";
import { useEvents } from "../../../hooks/useEvents";
import { useProof } from "../../../hooks/useProof";
import { useProofs } from "../../../hooks/useProofs";
import { getDemoProofOutcomePresentation } from "../../../util/demo-proof-outcome";
import { mergeProductAnglesDetailOrder } from "../../../util/angle-merge";
import { QuerySectionError } from "../QuerySectionError";
import { Separator } from "../ui/separator";
import { TableLoadingState } from "../ui/loading-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Badge } from "../ui/badge";
import {
  TruthRow,
  TruthSection,
  formatLocalDateAndTimeLines,
  formatLocalDateTime,
  truthJson,
  truthNotOnResponse,
  truthScalar,
} from "./truth-display";

/** List selection key for GET /proofs/:id — prefer primary `proof_id` (policy unit) over `event_id` so UI matches Traceability. */
function proofIdFromListSummary(item: ProofListItem): string | null {
  const sum = item.proof_list_summary;
  const id = sum?.proof_id ?? sum?.event_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function safeRecord(obj: unknown): Record<string, unknown> {
  if (obj !== undefined && obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    return obj as Record<string, unknown>;
  }
  return {};
}

function proofStatusPresentation(status: string | null | undefined): { label: string; className: string } {
  const raw = status?.trim() || "—";
  const s = raw.toLowerCase();
  if (/fail|error|mixed|invalid|block|denied/i.test(s)) {
    return {
      label: raw,
      className: "border-destructive/35 bg-destructive/10 text-destructive font-medium",
    };
  }
  if (/pass|clean|ok|success|valid|sufficient|complete/i.test(s)) {
    return {
      label: raw,
      className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 font-medium",
    };
  }
  return { label: raw, className: "border-border bg-muted/40 text-muted-foreground" };
}

function proofRowSummary(sum: ProofListSummary | undefined): string {
  if (!sum) return "";
  const fl = sum.failure_locator_summary;
  if (fl && (fl.reason_code || fl.angle)) {
    const parts = [fl.angle, fl.reason_code].filter((x) => x && String(x).trim() !== "");
    if (parts.length) return parts.join(" · ");
  }
  if (sum.primary_failure_category) return String(sum.primary_failure_category);
  if (sum.proof_sufficiency) return String(sum.proof_sufficiency);
  if (sum.event_type) return `Evaluated: ${sum.event_type}`;
  return "";
}

function groupEventsByLineage(items: EventListItem[]): Map<string, EventListItem[]> {
  const m = new Map<string, EventListItem[]>();
  for (const e of items) {
    const lid = e.event_lineage_id || e.lineage_id || "";
    if (!m.has(lid)) m.set(lid, []);
    m.get(lid)!.push(e);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
  }
  return m;
}

export function ProofsProofsList({
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
  const listQ = useProofs(subjectId);
  const [selectedProofId, setSelectedProofId] = useState<string | null>(null);

  const items = listQ.data?.items ?? [];

  useEffect(() => {
    setSelectedProofId(null);
  }, [subjectId, shellResetEpoch]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedProofId(null);
      return;
    }
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(SESSION_PENDING_PROOF_ID_KEY);
      if (pending) sessionStorage.removeItem(SESSION_PENDING_PROOF_ID_KEY);
    } catch {
      pending = null;
    }
    const first = proofIdFromListSummary(items[0]!);
    setSelectedProofId((prev) => {
      if (pending && items.some((it) => proofIdFromListSummary(it) === pending)) return pending;
      if (prev && items.some((it) => proofIdFromListSummary(it) === prev)) return prev;
      return first;
    });
  }, [items]);

  const detailQ = useProof(selectedProofId ?? undefined);
  const eventsQ = useEvents(subjectId, 500, 0);

  const detail = detailQ.data;
  const pp = detail?.product_proof;

  if (listQ.isLoading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8 items-start min-w-0">
        <TableLoadingState />
      </div>
    );
  }

  if (listQ.error) {
    return (
      <QuerySectionError error={listQ.error as Error} title="Proofs list unavailable" className="max-w-xl" />
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-6 rounded-xl border border-border bg-card text-sm text-muted-foreground leading-relaxed">
        No proofs yet. Ingest an event to generate a proof, or run a demo scenario from Demo controls.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8 items-start min-w-0">
      <div className="space-y-4 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">Proofs — verification outcomes</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Status, anchoring, flags, and lineage—this is the product truth center for each event.
            </p>
            {demoMode ? (
              <p className="text-[11px] text-muted-foreground/90 mt-2 max-w-xl leading-relaxed">
                Copy below each row is derived from <strong className="text-foreground/90 font-medium">proof status</strong>
                , failure locators, and angle outcomes—not from which demo button you clicked.
              </p>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground font-mono shrink-0">
            {listQ.data?.page.total ?? items.length} total
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card w-full min-w-0 overflow-hidden shadow-sm">
          <Table
            className="table-fixed w-full min-w-0"
            containerClassName="overflow-x-hidden"
          >
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[30%]" />
              <col className="w-[30%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
            </colgroup>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="text-xs whitespace-normal align-bottom">Status</TableHead>
                <TableHead className="text-xs whitespace-normal align-bottom">Time</TableHead>
                <TableHead className="text-xs whitespace-normal align-bottom">Summary</TableHead>
                <TableHead className="text-xs whitespace-normal align-bottom">Proof</TableHead>
                <TableHead className="text-xs whitespace-normal align-bottom">Anchor</TableHead>
                <TableHead className="text-xs whitespace-normal align-bottom">Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row, idx) => {
                const id = proofIdFromListSummary(row);
                const sum = row.proof_list_summary;
                const selected = Boolean(id && selectedProofId === id);
                const clickable = Boolean(id);
                const ts = sum?.event_timestamp;
                const statusVis = proofStatusPresentation(sum?.proof_status ?? null);
                const summaryText = proofRowSummary(sum);
                const demoPres =
                  demoMode && demoRail && sum
                    ? getDemoProofOutcomePresentation(demoRail, {
                        proof_status: sum.proof_status,
                        failure_locator_summary: sum.failure_locator_summary,
                        failed_angles: sum.failed_angles,
                        primary_failure_category: sum.primary_failure_category,
                        proof_sufficiency: sum.proof_sufficiency,
                      })
                    : null;
                return (
                  <TableRow
                    key={sum?.proof_id ?? sum?.event_id ?? idx}
                    className={`transition-colors ${clickable ? "cursor-pointer" : "cursor-default opacity-80"} ${
                      selected ? "bg-accent" : clickable ? "hover:bg-accent/50" : ""
                    }`}
                    onClick={() => id && setSelectedProofId(id)}
                  >
                    <TableCell className="text-xs align-top whitespace-normal">
                      <div className="flex flex-col items-start gap-1 min-w-0">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-normal whitespace-normal break-words text-left w-max max-w-full ${statusVis.className}`}
                        >
                          {statusVis.label}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs align-top whitespace-normal">
                      {(() => {
                        const stack = formatLocalDateAndTimeLines(ts);
                        if (!stack) return ts && ts.trim() ? ts : "—";
                        return (
                          <div className="flex flex-col gap-0.5 min-w-0 leading-tight">
                            <span className="break-words">{stack.dateLine}</span>
                            <span className="text-[10px] text-muted-foreground tabular-nums break-words">
                              {stack.timeLine}
                            </span>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-xs align-top min-w-0 leading-snug text-muted-foreground whitespace-normal break-words">
                      <div className="break-words">{summaryText || "—"}</div>
                      {demoPres ? (
                        <div className="mt-2 space-y-1 rounded-md border border-border/70 bg-muted/20 p-2 overflow-hidden">
                          <div className="text-[11px] font-medium text-foreground/95 leading-snug break-words">
                            {demoPres.headline}
                          </div>
                          <div className="text-[10px] text-muted-foreground leading-snug break-words">
                            {demoPres.subheadline}
                          </div>
                          {demoPres.baselineDetail ? (
                            <div className="text-[10px] text-muted-foreground/90 leading-snug break-words">
                              {demoPres.baselineDetail}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] align-top min-w-0 whitespace-normal break-all">
                      {truthScalar(sum?.proof_id)}
                    </TableCell>
                    <TableCell className="text-xs align-top whitespace-normal break-words">
                      {truthScalar(sum?.anchor_status)}
                    </TableCell>
                    <TableCell className="text-xs font-mono align-top whitespace-normal tabular-nums">
                      {truthScalar(sum?.flags_count)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-4 min-w-0">
        {!selectedProofId ? (
          <div className="flex min-h-[12rem] items-center justify-center p-6 rounded-xl border border-border bg-card text-muted-foreground text-sm text-center">
            Select a proof to inspect verification status, anchors, and angle results.
          </div>
        ) : detailQ.isLoading ? (
          <TableLoadingState />
        ) : detailQ.error ? (
          <QuerySectionError
            error={detailQ.error as Error}
            title="Proof detail unavailable"
            className="min-h-[12rem]"
          />
        ) : (
          <ProofDetailBody detail={detail} pp={pp} eventsQ={eventsQ} />
        )}
      </div>
    </div>
  );
}

function ProofDetailBody({
  detail,
  pp,
  eventsQ,
}: {
  detail: ProofDetailEnvelope | undefined;
  pp: ProductProof | undefined;
  eventsQ: ReturnType<typeof useEvents>;
}) {
  const angleSlots = useMemo(() => mergeProductAnglesDetailOrder(pp?.angles), [pp?.angles]);
  const anchorMetadata = safeRecord(detail?.anchor_metadata);

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
        <h2 className="text-sm font-medium">Proof detail</h2>
        <span className="text-xs font-mono text-muted-foreground">
          {pp ? truthScalar(pp.proof_status) : "No data"}
        </span>
      </div>

      <div className="space-y-6 p-4 sm:p-6 rounded-xl border border-border bg-card min-w-0 overflow-x-hidden">
        <SummarySection pp={pp} />
        <Separator />
        <SevenAnglesSection angleSlots={angleSlots} />
        <Separator />
        <BaselineVsActualSection angleSlots={angleSlots} />
        <Separator />
        <EventTraceSection pp={pp} />
        <Separator />
        <LineageTimelineSection eventsQ={eventsQ} />
        <Separator />
        <FailureLocatorSection pp={pp} />
        <Separator />
        <ProofAnchorMetadataSection pp={pp} anchorMetadata={anchorMetadata} />
      </div>
    </>
  );
}

function SummarySection({ pp }: { pp: ProductProof | undefined }) {
  const statusVis = proofStatusPresentation(pp?.proof_status ?? null);
  const [verificationStatus, setVerificationStatus] = useState<
    "loading" | "valid" | "invalid" | "not_anchored" | "error"
  >("loading");
  const [verification, setVerification] = useState<ProofVerificationResponse | null>(null);

  useEffect(() => {
    const proofId = pp?.proof_id;
    if (!proofId) {
      setVerificationStatus("error");
      setVerification(null);
      return;
    }

    let cancelled = false;
    setVerificationStatus("loading");
    setVerification(null);

    void apiFetch<ProofVerificationResponse>(`/proofs/${proofId}/verification`)
      .then((res) => {
        if (cancelled) return;
        const status = res.verification_status;
        if (status === "valid" || status === "invalid" || status === "not_anchored" || status === "error") {
          setVerificationStatus(status);
        } else {
          setVerificationStatus("error");
        }
        setVerification(res);
      })
      .catch(() => {
        if (cancelled) return;
        setVerificationStatus("error");
        setVerification(null);
      });

    return () => {
      cancelled = true;
    };
  }, [pp?.proof_id]);

  const summaryExplorerHref = useMemo(
    () => (pp != null ? pp.anchor_explorer_url?.trim() || verification?.explorer_url?.trim() || null : null),
    [pp, verification],
  );

  return (
    <TruthSection title="A. Summary">
      {!pp ? (
        <div className="text-sm text-muted-foreground">No data yet</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground">Status</span>
            <Badge variant="outline" className={`text-[10px] font-normal ${statusVis.className}`}>
              {statusVis.label}
            </Badge>
          </div>
          {pp.proof_summary ? (
            <p className="text-sm text-foreground leading-relaxed mb-3">{pp.proof_summary}</p>
          ) : null}
          <TruthRow label="proof_id" value={truthScalar(pp.proof_id)} />
          <TruthRow label="subject_id" value={truthScalar(pp.subject_id)} />
          <TruthRow label="timestamp · local" value={formatLocalDateTime(pp.event_timestamp)} />
          <TruthRow label="timestamp · ISO-8601" value={truthScalar(pp.event_timestamp)} />
          <TruthRow label="event_type" value={truthScalar(pp.event_type)} />
          <TruthRow label="verification_source" value={truthScalar(pp.verifier_version)} />
          <TruthRow label="proof_digest" value={truthScalar(pp.proof_digest)} />
          <TruthRow label="anchor_batch_id" value={truthScalar(pp.anchor_batch_id)} />
          <TruthRow label="anchor_status" value={truthScalar(pp.anchor_status)} />
          <div className="pt-2">
            <div className="text-xs text-muted-foreground mb-1">Verification</div>
            <TruthRow label="status" value={truthScalar(verificationStatus)} />
            {verificationStatus === "valid" ? (
              <TruthRow label="result" value="✔ Verified against anchored root" />
            ) : null}
            {verificationStatus === "invalid" ? (
              <TruthRow label="result" value="❌ Mismatch with anchored root" />
            ) : null}
            {verificationStatus === "not_anchored" ? <TruthRow label="result" value="No anchor found" /> : null}
            {verificationStatus === "error" ? <TruthRow label="result" value="Verification error" /> : null}
            {summaryExplorerHref ? (
              <TruthRow
                label="explorer_url"
                value={
                  <a className="underline" href={summaryExplorerHref} target="_blank" rel="noreferrer">
                    View on Solana Explorer →
                  </a>
                }
              />
            ) : null}
          </div>
        </>
      )}
    </TruthSection>
  );
}

function angleArrays(a: ProductAngleResult | null) {
  return {
    evidence_refs: Array.isArray(a?.evidence_refs) ? a!.evidence_refs : [],
    compared_fields: Array.isArray(a?.compared_fields) ? a!.compared_fields : [],
    changed_fields: Array.isArray(a?.changed_fields) ? a!.changed_fields : [],
    metadata:
      a?.metadata !== undefined && a?.metadata !== null && typeof a.metadata === "object" && !Array.isArray(a.metadata)
        ? (a.metadata as Record<string, unknown>)
        : {},
  };
}

function SevenAnglesSection({
  angleSlots,
}: {
  angleSlots: ReturnType<typeof mergeProductAnglesDetailOrder>;
}) {
  return (
    <TruthSection title="B. Seven angles">
      <div className="space-y-4">
        {angleSlots.map((slot) => {
          const a = slot.data;
          if (!a) {
            return (
              <div key={slot.angle} className="p-3 rounded-lg border border-border bg-background/50">
                <div className="text-xs font-mono mb-1">{slot.angle}</div>
                <div className="text-sm text-muted-foreground">No data</div>
              </div>
            );
          }
          const { evidence_refs, compared_fields, changed_fields, metadata } = angleArrays(a);
          const rc = a.reason_code?.trim() ? a.reason_code : "NOT_EVALUATED";
          const explained = explainAngleReasonCode(rc);
          const baseUx = baselineUxState(a);
          return (
            <div key={slot.angle} className="p-3 rounded-lg border border-border bg-background/50 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-mono font-medium">{a.angle}</div>
                <Badge variant="outline" className="text-[10px] font-normal">
                  {a.status}
                </Badge>
                <Badge variant="secondary" className="text-[10px] font-normal">
                  baseline: {baseUx}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>
                  <span className="font-medium text-foreground">Why: </span>
                  {explained.label}
                </div>
                <div>
                  <span className="font-medium text-foreground">What to fix: </span>
                  {explained.fix}
                </div>
              </div>
              <TruthRow label="reason_code" value={truthScalar(rc)} />
              <div className="text-xs text-muted-foreground pt-1">evidence_refs</div>
              <pre className="p-2 rounded bg-muted/30 text-[11px] whitespace-pre-wrap break-words max-w-full">
                {truthJson(evidence_refs)}
              </pre>
              <div className="text-xs text-muted-foreground">compared_fields</div>
              <pre className="p-2 rounded bg-muted/30 text-[11px] whitespace-pre-wrap break-words max-w-full">
                {truthJson(compared_fields)}
              </pre>
              <div className="text-xs text-muted-foreground">changed_fields</div>
              <pre className="p-2 rounded bg-muted/30 text-[11px] whitespace-pre-wrap break-words max-w-full">
                {truthJson(changed_fields)}
              </pre>
              <div className="text-xs text-muted-foreground">metadata</div>
              <pre className="p-2 rounded bg-muted/30 text-[11px] whitespace-pre-wrap break-words max-w-full max-h-40 overflow-y-auto">
                {truthJson(metadata)}
              </pre>
            </div>
          );
        })}
      </div>
    </TruthSection>
  );
}

function BaselineVsActualSection({
  angleSlots,
}: {
  angleSlots: ReturnType<typeof mergeProductAnglesDetailOrder>;
}) {
  return (
    <TruthSection title="C. Baseline vs actual (per angle, backend fields only)">
      <div className="space-y-4">
        {angleSlots.map((slot) => {
          const a = slot.data;
          if (!a) {
            return (
              <div key={slot.angle} className="p-3 rounded-lg border border-dashed border-border">
                <div className="text-xs font-mono">{slot.angle}</div>
                <div className="text-sm text-muted-foreground">No data</div>
              </div>
            );
          }
          const ch = Array.isArray(a.changed_fields) ? a.changed_fields : [];
          return (
            <div key={slot.angle} className="p-3 rounded-lg border border-border space-y-2">
              <div className="text-xs font-mono font-medium">{a.angle}</div>
              <TruthRow label="baseline_summary" value={truthScalar(a.baseline_summary)} />
              <TruthRow label="expected_summary" value={truthScalar(a.expected_summary)} />
              <TruthRow label="actual_summary" value={truthScalar(a.actual_summary)} />
              <div className="text-xs text-muted-foreground">changed_fields</div>
              <pre className="p-2 rounded bg-muted/30 text-[11px] whitespace-pre-wrap break-words max-w-full">{truthJson(ch)}</pre>
            </div>
          );
        })}
      </div>
    </TruthSection>
  );
}

function EventTraceSection({ pp }: { pp: ProductProof | undefined }) {
  return (
    <TruthSection title="D. Event trace (product_proof event identity)">
      {!pp ? (
        <div className="text-sm text-muted-foreground">No data</div>
      ) : (
        <>
          <TruthRow label="event_id" value={truthScalar(pp.event_id)} />
          <TruthRow label="event_lineage_id" value={truthScalar(pp.event_lineage_id)} />
          <TruthRow label="event_version" value={truthScalar(pp.event_version)} />
          <TruthRow label="timestamp · local" value={formatLocalDateTime(pp.event_timestamp)} />
          <TruthRow label="timestamp · ISO-8601" value={truthScalar(pp.event_timestamp)} />
          <TruthRow label="artifact_reference (artifact_id)" value={truthScalar(pp.artifact_id)} />
        </>
      )}
    </TruthSection>
  );
}

function LineageTimelineSection({ eventsQ }: { eventsQ: ReturnType<typeof useEvents> }) {
  if (eventsQ.isLoading) {
    return (
      <TruthSection title="E. Lineage timeline (GET /subjects/:id/events)">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </TruthSection>
    );
  }
  if (eventsQ.error) {
    return (
      <TruthSection title="E. Lineage timeline (GET /subjects/:id/events)">
        <QuerySectionError error={eventsQ.error as Error} title="Lineage timeline unavailable" />
      </TruthSection>
    );
  }
  const items = eventsQ.data?.items ?? [];
  const groups = groupEventsByLineage(items);
  const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <TruthSection title="E. Lineage timeline (GET /subjects/:id/events)">
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No events loaded for this subject yet.</div>
      ) : (
        <div className="space-y-4">
          {keys.map((lineageId) => (
            <div key={lineageId || "empty-lineage"} className="p-3 rounded-lg border border-border">
              <div className="text-xs font-mono text-muted-foreground mb-2">
                event_lineage_id: {lineageId || truthScalar(null)}
              </div>
              <ol className="list-decimal list-inside space-y-2 text-xs font-mono">
                {(groups.get(lineageId) ?? []).map((e) => (
                  <li key={e.event_id} className="break-all">
                    event_version={e.version} · event_timestamp (local)={formatLocalDateTime(e.timestamp ?? e.occurred_at)} ·
                    event_id={e.event_id}
                    {e.artifact_id != null && e.artifact_id !== "" ? (
                      <> · artifact_id={truthScalar(e.artifact_id)}</>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </TruthSection>
  );
}

function FailureLocatorSection({ pp }: { pp: ProductProof | undefined }) {
  const fl = pp?.failure_locator;
  const loc = fl && typeof fl === "object" ? (fl as Record<string, unknown>) : null;
  const rc = loc && typeof loc.reason_code === "string" ? loc.reason_code : "";
  const flExplained = rc ? explainAngleReasonCode(rc) : null;
  const hasEvidenceRefs = loc !== null && "evidence_refs" in loc && Array.isArray(loc.evidence_refs);
  const eventIdFromLocator =
    loc !== null && "event_id" in loc && typeof loc.event_id === "string" && loc.event_id.length > 0
      ? loc.event_id
      : null;

  return (
    <TruthSection title="F. Failure locator (product_proof.failure_locator)">
      {!pp ? (
        <div className="text-sm text-muted-foreground">No data</div>
      ) : !loc ? (
        <>
          <TruthRow label="angle" value={truthScalar(null)} />
          <TruthRow label="step" value={truthScalar(null)} />
          <TruthRow label="reason_code" value={truthScalar(null)} />
          <TruthRow label="event_id" value={truthScalar(pp.event_id)} />
          <div className="text-xs text-muted-foreground pt-1">evidence_refs</div>
          <div className="text-sm text-muted-foreground">{truthNotOnResponse()}</div>
        </>
      ) : (
        <>
          <TruthRow label="angle" value={truthScalar(loc.angle)} />
          <TruthRow label="step" value={truthScalar(loc.step)} />
          <TruthRow label="reason_code" value={truthScalar(loc.reason_code)} />
          {flExplained ? (
            <div className="rounded-lg border border-border bg-muted/20 p-2 text-xs space-y-1">
              <div className="font-medium">{flExplained.label}</div>
              <p className="text-muted-foreground leading-relaxed">{flExplained.fix}</p>
            </div>
          ) : null}
          <TruthRow
            label="event_id"
            value={
              eventIdFromLocator != null
                ? truthScalar(eventIdFromLocator)
                : truthScalar(pp.event_id)
            }
          />
          <div className="text-xs text-muted-foreground pt-1">evidence_refs</div>
          {hasEvidenceRefs ? (
            <pre className="p-2 rounded bg-muted/30 text-[11px] whitespace-pre-wrap break-words max-w-full">
              {truthJson(loc.evidence_refs)}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground">{truthNotOnResponse()}</div>
          )}
        </>
      )}
    </TruthSection>
  );
}
