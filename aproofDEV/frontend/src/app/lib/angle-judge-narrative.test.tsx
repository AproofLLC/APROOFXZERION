import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AngleJudgeNarrative } from "./angle-judge-narrative";

describe("AngleJudgeNarrative", () => {
  it("renders purpose, runtime meaning, and why it matters for a known angle", () => {
    render(<AngleJudgeNarrative angleKey="policy_integrity" />);
    expect(screen.getByTestId("angle-judge-narrative")).toBeInTheDocument();
    expect(screen.getByText(/Purpose:/)).toBeInTheDocument();
    expect(screen.getByText(/Runtime meaning:/)).toBeInTheDocument();
    expect(screen.getByText(/Why it matters:/)).toBeInTheDocument();
    expect(screen.getByText(/scoped governance/)).toBeInTheDocument();
  });

  it("renders nothing for unknown angle keys", () => {
    const { container } = render(<AngleJudgeNarrative angleKey="unknown_angle_xyz" />);
    expect(container.querySelector('[data-testid="angle-judge-narrative"]')).toBeNull();
  });
});
