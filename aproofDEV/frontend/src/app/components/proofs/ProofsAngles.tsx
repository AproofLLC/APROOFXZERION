import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AUTO_ENABLED_ANGLES_BY_RAIL } from "@aproof/baselines/auto-enabled-angles-by-rail";
import { ANGLE_LABELS, angleNeedsEvidenceWarning } from "../../../constants/angle-display";
import { truthTagsForAngle } from "../../../constants/angle-truth-tags";
import { userFacingSubjectType } from "../../../constants/subject-type-display";
import {
  getDemoBaselinePresentation,
  type DemoBaselineTier,
} from "../../../util/demo-baseline-presentation";
import { useAngles } from "../../../hooks/useAngles";
import { useBaselineDetail } from "../../../hooks/useBaselineDetail";
import { useUpdateBaselines, type BaselineAnglePatch } from "../../../hooks/useUpdateBaselines";
import type { AngleSummary } from "../../../api/types";
import { QuerySectionError } from "../QuerySectionError";
import { Button } from "../ui/button";
import { LoadingState } from "../ui/loading-state";
import { TruthRow, truthJson, truthNotOnResponse, truthScalar } from "./truth-display";

function sourceSurfaceLabel(row: AngleSummary): string {
  if (!row.enabled) return "Disabled (not evaluated)";
  if (!row.baseline_present) return "No baseline row";
  if (row.sources_state === "no sources") return "No source data";
  return "Source available";
}

function AngleTechnicalPanel({
  subjectId,
  angle,
  open,
}: {
  subjectId: string;
  angle: string;
  open: boolean;
}) {
  const detailQ = useBaselineDetail(subjectId, angle, open);
  if (!open) return null;
  if (detailQ.isLoading) return <p className="text-xs text-muted-foreground py-2">Loading technical detail…</p>;
  if (detailQ.error || !detailQ.data) {
    return <p className="text-xs text-destructive py-2">Could not load detail for this angle.</p>;
  }
  const d = detailQ.data;
  const def = d.definition as Record<string, unknown> | undefined;
  const angleResult =
    def && typeof def === "object" && def.angle_control && typeof def.angle_control === "object"
      ? (def.angle_control as Record<string, unknown>)
      : null;
  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs">
      <div className="font-medium text-muted-foreground">Technical (API)</div>
      <TruthRow label="baseline_version" value={truthScalar(String(d.baseline_version))} />
      <TruthRow label="evidence_sufficiency" value={truthScalar(d.evidence_sufficiency)} />
      <TruthRow label="sources_state" value={truthScalar(d.sources_state)} />
      <TruthRow label="definition (full)" value={truthJson(d.definition)} />
      <TruthRow label="baseline_rules" value={truthJson(d.baseline_rules)} />
      <TruthRow label="current_values" value={truthJson(d.current_values)} />
      <TruthRow
        label="expected_summary / actual_summary / changed_fields (per proof read)"
        value={truthNotOnResponse()}
      />
      {angleResult ? (
        <TruthRow label="angle_control (from definition)" value={truthJson(angleResult)} />
      ) : null}
    </div>
  );
}

function ConfigFields({
  angle,
  config,
  onSave,
  disabled,
}: {
  angle: string;
  config: Record<string, unknown>;
  onSave: (next: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const [local, setLocal] = useState(() => JSON.stringify(config ?? {}, null, 2));
  useEffect(() => {
    setLocal(JSON.stringify(config ?? {}, null, 2));
  }, [config]);

  if (angle === "retrieval_integrity") {
    const min = typeof config.min_sources === "number" ? config.min_sources : 1;
    const req = config.retrieval_required === true;
    return (
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={req}
            disabled={disabled}
            onChange={(e) => onSave({ ...config, retrieval_required: e.target.checked })}
          />
          <span>Retrieval required</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground w-28">Min sources</span>
          <input
            type="number"
            min={0}
            className="border border-border rounded px-2 py-1 w-24 bg-background"
            disabled={disabled}
            value={min}
            onChange={(e) => onSave({ ...config, min_sources: Number(e.target.value) || 0 })}
          />
        </label>
      </div>
    );
  }
  if (angle === "identity_access_integrity") {
    return (
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.require_actor_id === true}
            disabled={disabled}
            onChange={(e) => onSave({ ...config, require_actor_id: e.target.checked })}
          />
          <span>Require actor_id</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.require_actor_type === true}
            disabled={disabled}
            onChange={(e) => onSave({ ...config, require_actor_type: e.target.checked })}
          />
          <span>Require actor_type</span>
        </label>
      </div>
    );
  }
  if (angle === "cross_system_integrity") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={config.require_related_system_refs === true}
          disabled={disabled}
          onChange={(e) => onSave({ ...config, require_related_system_refs: e.target.checked })}
        />
        <span>Require related system refs</span>
      </label>
    );
  }
  if (angle === "model_identity_integrity") {
    const raw = Array.isArray(config.allowed_model_names) ? (config.allowed_model_names as string[]).join(", ") : "";
    return (
      <label className="block text-sm space-y-1">
        <span className="text-muted-foreground">Allowed model names (comma-separated)</span>
        <input
          className="w-full border border-border rounded px-2 py-1 bg-background font-mono text-xs"
          disabled={disabled}
          value={raw}
          onChange={(e) =>
            onSave({
              ...config,
              allowed_model_names: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
    );
  }
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">Config (JSON)</div>
      <textarea
        className="w-full min-h-[88px] font-mono text-xs border border-border rounded p-2 bg-background"
        disabled={disabled}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          try {
            const parsed = JSON.parse(local) as Record<string, unknown>;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) onSave(parsed);
          } catch {
            toast.error("Invalid JSON — fix before saving.");
          }
        }}
      />
    </div>
  );
}

function truthTagBadgeClass(tag: string): string {
  if (tag === "Governance") return "border-violet-500/35 bg-violet-500/10 text-foreground/90";
  if (tag === "Provenance") return "border-sky-500/35 bg-sky-500/10 text-foreground/90";
  if (tag === "Functional") return "border-emerald-500/35 bg-emerald-500/10 text-foreground/90";
  return "border-border bg-muted/30";
}

function AngleCard({
  subjectId,
  row,
  mutation,
  onSaved,
  readOnly = false,
  demoRail = "",
  baselineTier = "default_active",
}: {
  subjectId: string;
  row: AngleSummary;
  mutation: ReturnType<typeof useUpdateBaselines>;
  onSaved: () => void;
  readOnly?: boolean;
  /** Subject type rail for demo copy (e.g. model, agent). */
  demoRail?: string;
  baselineTier?: DemoBaselineTier;
}) {
  const meta = ANGLE_LABELS[row.angle] ?? { title: row.angle, purpose: "" };
  const [openTech, setOpenTech] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const demoPresentation =
    readOnly && demoRail.trim() !== ""
      ? getDemoBaselinePresentation(demoRail, row.angle, row, baselineTier)
      : null;
  const truthTags = truthTagsForAngle(row.angle);

  const patch = (partial: BaselineAnglePatch) => {
    mutation.mutate(
      { [row.angle]: partial },
      {
        onSuccess: () => onSaved(),
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <div
      className={`p-4 rounded-xl border space-y-3 ${
        baselineTier === "optional"
          ? "border-dashed border-border/90 bg-muted/15 opacity-[0.97]"
          : "border-border bg-card ring-1 ring-primary/15 shadow-sm"
      }`}
    >
      <div>
        <div className="font-medium text-foreground">{meta.title}</div>
        {demoPresentation ? null : <p className="text-sm text-muted-foreground mt-1">{meta.purpose}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="rounded-full px-2 py-0.5 border border-dashed border-border/80 bg-muted/25 text-[10px] text-muted-foreground">
          {baselineTier === "default_active" ? "Default active (this rail)" : "Optional for this rail"}
        </span>
        {truthTags.map((tag) => (
          <span key={tag} className={`rounded-full px-2 py-0.5 border text-[10px] font-medium ${truthTagBadgeClass(tag)}`}>
            {tag}
          </span>
        ))}
      </div>
      {demoPresentation ? (
        <div className="rounded-md border border-border/80 bg-muted/20 p-3 space-y-2 text-xs">
          <p className="text-[11px] font-medium text-foreground/95 leading-snug">{demoPresentation.governsWhat}</p>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="rounded-full px-2 py-0.5 border border-border bg-background/80 text-[10px] font-medium">
              {demoPresentation.category}
            </span>
            {demoPresentation.governanceTag ? (
              <span className="rounded-full px-2 py-0.5 border border-primary/25 bg-primary/10 text-[10px] text-foreground/90">
                {demoPresentation.governanceTag}
              </span>
            ) : null}
            <span
              className={`rounded-full px-2 py-0.5 border text-[10px] ${
                row.enabled ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-muted/30"
              }`}
            >
              {row.enabled ? "Active" : "Off"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 border text-[10px] ${
                row.required ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted/30"
              }`}
            >
              {row.required ? "Required" : "Optional slot"}
            </span>
          </div>
          <p className="text-foreground/95 leading-relaxed">{demoPresentation.expectation}</p>
          <p className="text-muted-foreground leading-relaxed">{demoPresentation.whyMatters}</p>
          {demoPresentation.backendSummary ? (
            <p className="text-[11px] text-muted-foreground border-t border-border/60 pt-2 mt-1 leading-relaxed">
              <span className="font-medium text-foreground/80">Current baseline summary: </span>
              {demoPresentation.backendSummary}
            </p>
          ) : null}
        </div>
      ) : null}
      {!demoPresentation ? (
        <>
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span
              className={`rounded-full px-2 py-0.5 border ${row.enabled ? "border-emerald-500/50 bg-emerald-500/10" : "border-border bg-muted/40"}`}
            >
              {row.enabled ? "Enabled" : "Disabled"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 border ${row.required ? "border-amber-500/50 bg-amber-500/10" : "border-border bg-muted/40"}`}
            >
              {row.required ? "Required" : "Optional"}
            </span>
            <span className="rounded-full px-2 py-0.5 border border-border bg-muted/30">
              {row.default_origin === "user" ? "User-enabled" : "Auto-enabled"}
            </span>
            <span className="rounded-full px-2 py-0.5 border border-border bg-muted/20 text-muted-foreground">
              {sourceSurfaceLabel(row)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">{truthScalar(row.baseline_summary)}</div>
        </>
      ) : null}

      {!readOnly && row.enabled && angleNeedsEvidenceWarning(row.angle) && (
        <p className="text-xs text-amber-800 dark:text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-md px-2 py-1.5">
          This angle requires supporting subject data in events. If marked <strong>required</strong> and the data is
          missing, proofs will fail.
        </p>
      )}

      {!readOnly ? (
        <div className="flex flex-wrap gap-4 items-center text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={row.enabled}
              disabled={mutation.isPending}
              onChange={(e) => patch({ enabled: e.target.checked })}
            />
            <span>Enable angle</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={row.required}
              disabled={mutation.isPending || !row.enabled}
              onChange={(e) => patch({ required: e.target.checked })}
            />
            <span>Required</span>
          </label>
        </div>
      ) : null}

      {!readOnly ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowConfig((v) => !v)}>
            {showConfig ? "Hide config" : "Edit config"}
          </Button>
          {showConfig && (
            <div className="mt-3 p-3 rounded-lg border border-border bg-muted/20">
              <ConfigFields
                angle={row.angle}
                config={row.config ?? {}}
                disabled={mutation.isPending || !row.enabled}
                onSave={(next) => patch({ config: next })}
              />
            </div>
          )}
        </div>
      ) : null}

      <div>
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setOpenTech((o) => !o)}
        >
          {openTech ? "Hide" : "Show"} technical details
        </button>
        <AngleTechnicalPanel subjectId={subjectId} angle={row.angle} open={openTech} />
      </div>
    </div>
  );
}

export function ProofsAngles({
  subjectId,
  subjectType,
  readOnlyDemo = false,
}: {
  subjectId: string;
  subjectType: string;
  /** Demo mode: baselines are view-only; editing is for production workspaces. */
  readOnlyDemo?: boolean;
}) {
  const listQ = useAngles(subjectId);
  const mutation = useUpdateBaselines(subjectId);
  const saveToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSavedToast = () => {
    if (saveToastTimer.current) clearTimeout(saveToastTimer.current);
    saveToastTimer.current = setTimeout(() => {
      toast.success("Baselines updated");
      saveToastTimer.current = null;
    }, 450);
  };

  const summary = useMemo(() => {
    const rows = listQ.data ?? [];
    const required = rows.filter((r) => r.required);
    const optionalOn = rows.filter((r) => r.enabled && !r.required);
    const autoEnabled = rows.filter((r) => r.enabled && r.default_origin === "auto");
    return {
      autoEnabledCount: autoEnabled.length,
      requiredCount: required.length,
      optionalEnabledCount: optionalOn.length,
    };
  }, [listQ.data]);

  if (listQ.isLoading) return <LoadingState message="Loading baselines…" />;
  if (listQ.error) {
    return <QuerySectionError error={listQ.error as Error} title="Baselines unavailable" />;
  }

  const rows = listQ.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 border border-border rounded-xl">
        No baseline data yet.
      </div>
    );
  }

  const rail = subjectType?.trim() || "system";
  const byRail = AUTO_ENABLED_ANGLES_BY_RAIL as Readonly<Record<string, readonly string[]>>;
  const activeAngles = byRail[rail] ?? byRail.system ?? [];
  const activeSet = new Set(activeAngles);
  const rowByAngle = new Map(rows.map((r) => [r.angle, r] as const));

  const activeDefaultRows = activeAngles
    .map((angle) => rowByAngle.get(angle))
    .filter((row): row is (typeof rows)[number] => Boolean(row));

  const optionalRows = rows
    .filter((r) => !activeSet.has(r.angle))
    .sort((a, b) => a.angle.localeCompare(b.angle));

  const missingSsotActiveAngles = activeAngles.filter((a) => !rowByAngle.has(a));

  const renderGroup = (
    title: string,
    subtitle: string,
    groupRows: typeof rows,
    tier: DemoBaselineTier,
  ) => (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/80 bg-muted/15 px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{subtitle}</p>
      </div>
      <div className="space-y-4">
        {groupRows.map((row) => (
          <AngleCard
            key={row.angle}
            subjectId={subjectId}
            row={row}
            mutation={mutation}
            onSaved={scheduleSavedToast}
            readOnly={readOnlyDemo}
            demoRail={readOnlyDemo ? rail : ""}
            baselineTier={tier}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Baselines</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {readOnlyDemo
            ? "Seven integrity angles are always provisioned. Defaults reflect how this subject type is governed; the rest stay available to turn on when you need them."
            : "Define which angles are evaluated for this subject and what they must match."}
        </p>
        {!readOnlyDemo ? (
          <p className="text-xs text-muted-foreground mt-2">
            All angles are available. Objective defaults are enabled automatically for this subject type.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Subject type</div>
          <div className="font-medium mt-1">{userFacingSubjectType(subjectType)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Auto-enabled (on)</div>
          <div className="font-medium mt-1">{summary.autoEnabledCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Required</div>
          <div className="font-medium mt-1">{summary.requiredCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Optional enabled</div>
          <div className="font-medium mt-1">{summary.optionalEnabledCount}</div>
        </div>
      </div>

      {mutation.isPending && (
        <p className="text-xs text-muted-foreground" role="status">
          Saving…
        </p>
      )}

      {missingSsotActiveAngles.length > 0 ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
          role="alert"
        >
          <p className="font-medium">Missing baseline rows (expected by SSOT)</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            The API did not return baseline rows for these default-active angles:{" "}
            <span className="font-mono text-foreground/90">{missingSsotActiveAngles.join(", ")}</span>. This should not
            happen for a fully provisioned subject — refresh or check backend provisioning.
          </p>
        </div>
      ) : null}

      <div className="space-y-8">
        {renderGroup(
          "Active by default",
          "These baselines are auto-enabled from canonical rail defaults (SSOT) and represent the subject’s default proof posture.",
          activeDefaultRows,
          "default_active",
        )}
        {renderGroup(
          "Optional / available",
          "These baselines are provisioned and editable for this subject, but not in the rail’s default active set.",
          optionalRows,
          "optional",
        )}
      </div>
    </div>
  );
}
