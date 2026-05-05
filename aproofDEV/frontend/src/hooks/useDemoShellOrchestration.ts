import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "../api/client";
import type { SubjectOverview } from "../api/types";
import { DEMO_SCENARIO_TEMPLATE } from "../constants/demo-curated";
import type { DemoScenarioActionKind } from "../constants/demo-scenario";
import { refetchSubjectScopedQueries } from "../util/refetch-subject-scoped-queries";
import { resolveSubjectIdAfterSandboxMutation } from "../util/sandbox-reset-subject-resolver";
import {
  useSandboxReset,
  type DemoSandboxAction,
  type SandboxResetInput,
} from "./useSandboxReset";

function userFacingDemoError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (m.length > 200) return "Something went wrong. Try again.";
    return m;
  }
  return "Something went wrong. Try again.";
}

type OrchestrationParams = {
  demoRail: string;
  subjectId: string;
  onSubjectChange: (id: string) => void;
  setActiveTab: (tab: string) => void;
  bumpDetailPane: () => void;
  /**
   * Fires after overview is read so status + last line always match (same snapshot as the engine).
   */
  onDemoScenarioResolved?: (
    overview: SubjectOverview,
    kind: DemoScenarioActionKind | "full_reset",
  ) => void;
};

/**
 * Single place for demo sandbox handshake: mutation → subject list refetch → reconcile IDs from API/map →
 * refetch subject-scoped queries → tab + detail pane updates.
 */
export function useDemoShellOrchestration(params: OrchestrationParams) {
  const qc = useQueryClient();
  const reset = useSandboxReset();
  const [orchestrationHint, setOrchestrationHint] = useState<string | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const recordResolvedOutcome = useCallback(
    async (resolvedSubjectId: string, kind: DemoScenarioActionKind | "full_reset") => {
      const cb = paramsRef.current.onDemoScenarioResolved;
      if (!cb) return;
      try {
        const ov = await qc.fetchQuery({
          queryKey: ["overview", resolvedSubjectId],
          queryFn: () => apiFetch<SubjectOverview>(`/subjects/${resolvedSubjectId}/overview`),
        });
        qc.setQueryData(["overview", resolvedSubjectId], ov);
        cb(ov, kind);
      } catch {
        /* ignore */
      }
    },
    [qc],
  );

  const runTargeted = useCallback(
    async (demo_action: DemoSandboxAction, _successMessage: string, kind: DemoScenarioActionKind) => {
      const { demoRail, subjectId, onSubjectChange, setActiveTab, bumpDetailPane } = paramsRef.current;
      setOrchestrationHint("Running scenario…");
      try {
        const data = await reset.mutateAsync({
          mode: "targeted",
          demo_rail: demoRail,
          demo_action,
        });
        setOrchestrationHint("Rebinding subject state…");
        await qc.refetchQueries({ queryKey: ["subjects", 100, 0] });
        const resolved = resolveSubjectIdAfterSandboxMutation(data, {
          mode: "targeted",
          demoRail,
          priorSubjectId: subjectId,
        });
        if (resolved !== subjectId) {
          onSubjectChange(resolved);
        }
        setOrchestrationHint(
          kind === "clean_proof"
            ? "Refreshing proofs…"
            : kind === "failure"
              ? "Updating failure view…"
              : "Refreshing traceability…",
        );
        await refetchSubjectScopedQueries(qc, resolved);
        const tab =
          kind === "clean_proof" ? "proofs" : kind === "failure" ? "failures" : "traceability";
        setActiveTab(tab);
        bumpDetailPane();
        await recordResolvedOutcome(resolved, kind);
        toast.success("Sandbox updated.");
      } catch (e) {
        toast.error(userFacingDemoError(e));
      } finally {
        setOrchestrationHint(null);
      }
    },
    [qc, reset, recordResolvedOutcome],
  );

  const runFullReset = useCallback(async () => {
    const { subjectId, onSubjectChange, setActiveTab, bumpDetailPane, demoRail } = paramsRef.current;
    setOrchestrationHint("Running scenario…");
    try {
      const data = await reset.mutateAsync({
        mode: "full",
        template: DEMO_SCENARIO_TEMPLATE.resetDefault,
      });
      setOrchestrationHint("Rebinding subject state…");
      await qc.refetchQueries({ queryKey: ["subjects", 100, 0] });
      const resolved = resolveSubjectIdAfterSandboxMutation(data, {
        mode: "full",
        demoRail,
        priorSubjectId: subjectId,
      });
      if (resolved !== subjectId) {
        onSubjectChange(resolved);
      }
      setOrchestrationHint("Refreshing demo workspace…");
      await refetchSubjectScopedQueries(qc, resolved);
      setActiveTab("overview");
      bumpDetailPane();
      await recordResolvedOutcome(resolved, "full_reset");
      toast.success("Demo reset completed.");
    } catch (e) {
      toast.error(userFacingDemoError(e));
    } finally {
      setOrchestrationHint(null);
    }
  }, [qc, reset, recordResolvedOutcome]);

  const busy = reset.isPending || orchestrationHint !== null;

  return {
    runTargeted,
    runFullReset,
    orchestrationHint,
    busy,
    pendingKey: reset.isPending ? (reset.variables as SandboxResetInput | null) ?? null : null,
  };
}
