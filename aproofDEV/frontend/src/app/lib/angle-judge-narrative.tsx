import { getAngleExplanation } from "./angle-explanations";

/** Compact judge-facing copy: purpose, runtime meaning, why it matters (static mappings only). */
export function AngleJudgeNarrative({ angleKey }: { angleKey: string }) {
  const explanation = getAngleExplanation(angleKey);
  if (!explanation) return null;
  return (
    <div className="text-xs text-muted-foreground space-y-1.5 leading-relaxed" data-testid="angle-judge-narrative">
      <div>
        <span className="font-medium text-foreground/90">Purpose: </span>
        {explanation.purpose}
      </div>
      <div>
        <span className="font-medium text-foreground/90">Runtime meaning: </span>
        {explanation.runtimeMeaning}
      </div>
      <div>
        <span className="font-medium text-foreground/90">Why it matters: </span>
        {explanation.whyItMatters}
      </div>
    </div>
  );
}
