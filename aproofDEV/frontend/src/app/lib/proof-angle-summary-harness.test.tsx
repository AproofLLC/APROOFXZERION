import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../components/ui/badge";
import { TruthRow, truthScalar } from "../components/proofs/truth-display";
import { AngleJudgeNarrative } from "./angle-judge-narrative";
import { getAngleExplanation } from "./angle-explanations";

/** Mirrors B. Seven angles card order for regression: title → status → explanations → summaries. */
function ProofAngleCardHarness() {
  const angleKey = "deterministic_integrity";
  const explanation = getAngleExplanation(angleKey)!;
  return (
    <div>
      <div className="text-sm font-medium">{explanation.title}</div>
      <Badge variant="outline">pass</Badge>
      <AngleJudgeNarrative angleKey={angleKey} />
      <TruthRow label="expected_summary" value={truthScalar("expected-from-engine")} />
      <TruthRow label="actual_summary" value={truthScalar("actual-from-engine")} />
      <TruthRow label="baseline_summary" value={truthScalar("baseline-from-engine")} />
    </div>
  );
}

describe("proof summary angle card (order / copy)", () => {
  it("renders explanation sections before expected_summary and actual_summary", () => {
    render(<ProofAngleCardHarness />);
    const narrative = screen.getByTestId("angle-judge-narrative");
    const expectedRow = screen.getByText("expected-from-engine");
    expect(narrative.compareDocumentPosition(expectedRow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("actual-from-engine")).toBeInTheDocument();
    expect(screen.getByText("baseline-from-engine")).toBeInTheDocument();
  });
});
