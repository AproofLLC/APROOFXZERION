import type { DemoScenarioActionKind } from "../../../constants/demo-scenario";
import { DEMO_SCENARIO_TEMPLATE } from "../../../constants/demo-curated";
import type { DemoSandboxAction, SandboxResetInput } from "../../../hooks/useSandboxReset";
import { Button } from "../ui/button";

export type { DemoScenarioActionKind };

export function DemoControls({
  demoRail,
  runTargeted,
  runFullReset,
  busy,
  pendingKey,
}: {
  demoRail: string;
  runTargeted: (action: DemoSandboxAction, message: string, kind: DemoScenarioActionKind) => void;
  runFullReset: () => void;
  busy: boolean;
  pendingKey: SandboxResetInput | null | undefined;
}) {
  const labelFor = (match: SandboxResetInput, idle: string) => {
    if (!busy || !pendingKey) return idle;
    if (pendingKey.mode !== match.mode) return idle;
    if (match.mode === "full" && pendingKey.mode === "full") {
      return pendingKey.template === match.template ? "Running…" : idle;
    }
    if (match.mode === "targeted" && pendingKey.mode === "targeted") {
      return pendingKey.demo_rail === match.demo_rail && pendingKey.demo_action === match.demo_action
        ? "Running…"
        : idle;
    }
    return idle;
  };

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3"
      aria-label="Demo scenario controls"
    >
      <div>
        <h2 className="text-sm font-medium text-foreground">Demo controls</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
          Each scenario ingests a real sandbox event. Outcomes above reflect engine proof status—not the label on the
          button.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void runTargeted("clean_proof", "Clean proof scenario completed.", "clean_proof")
          }
        >
          {labelFor({ mode: "targeted", demo_rail: demoRail, demo_action: "clean_proof" }, "Run Clean Proof")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void runTargeted("failure", "Failure scenario completed.", "failure")}
        >
          {labelFor({ mode: "targeted", demo_rail: demoRail, demo_action: "failure" }, "Run Failure")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void runTargeted("version_update", "Version update scenario completed.", "version_update")
          }
        >
          {labelFor(
            { mode: "targeted", demo_rail: demoRail, demo_action: "version_update" },
            "Run Version Update",
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void runFullReset()}
        >
          {labelFor({ mode: "full", template: DEMO_SCENARIO_TEMPLATE.resetDefault }, "Reset Demo")}
        </Button>
      </div>
    </section>
  );
}
