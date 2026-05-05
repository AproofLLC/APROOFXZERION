import { classifyEngineProofOutcome, outcomeShortLabel } from "../../../util/demo-proof-outcome";

/**
 * Demo-only: top-level proof outcome + last scenario causal line (engine-driven, not button intent).
 */
export function DemoScenarioOutcome({
  snapshotStatus,
  lastActionLine,
}: {
  snapshotStatus: string | null | undefined;
  lastActionLine: string | null;
}) {
  const cls = classifyEngineProofOutcome(snapshotStatus);
  const hasSnapshot = typeof snapshotStatus === "string" && snapshotStatus.trim().length > 0;
  const label = hasSnapshot ? outcomeShortLabel(snapshotStatus) : "not evaluated";
  const bar =
    cls === "conformant"
      ? "border-emerald-500/35 bg-emerald-500/[0.06]"
      : cls === "non_conformant"
        ? "border-destructive/40 bg-destructive/[0.06]"
        : cls === "partial"
          ? "border-amber-500/40 bg-amber-500/[0.06]"
          : cls === "unverifiable"
            ? "border-violet-500/30 bg-violet-500/[0.05]"
            : "border-border bg-muted/25";

  return (
    <div
      className={`rounded-xl border px-4 py-3 space-y-2 min-h-[4.75rem] ${bar}`}
      role="region"
      aria-label="Latest proof outcome"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Latest proof</span>
        <span className="text-sm font-semibold text-foreground capitalize">{label}</span>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">
          {hasSnapshot ? "— engine status for this subject" : "— no event ingested yet"}
        </span>
      </div>
      {lastActionLine ? (
        <p className="text-xs text-foreground/95 leading-relaxed">{lastActionLine}</p>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Run a demo scenario below to ingest a fresh event; this line updates with what the proof engine concluded.
        </p>
      )}
    </div>
  );
}
