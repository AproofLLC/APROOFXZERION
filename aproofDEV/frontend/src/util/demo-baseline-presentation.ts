import type { AngleSummary } from "../api/types";
import { isAngleActiveByDefaultForRail } from "../constants/rail-auto-enabled";
import { truthTagsForAngle, type BaselineTruthTag } from "../constants/angle-truth-tags";

export type BaselinePresentationRole = "governance" | "provenance" | "both";

export type DemoBaselinePresentation = {
  /** Short governance category for chips */
  category: string;
  /** Plain sentence: what artifact or behavior this angle governs */
  governsWhat: string;
  /** What this baseline expects (plain language, no fabricated API fields) */
  expectation: string;
  /** One line: why it matters for this rail */
  whyMatters: string;
  /** Policy enforcement vs identity/lineage vs both (legacy one-liner; prefer truthTags) */
  role: BaselinePresentationRole;
  /** Optional provenance / enforcement flavor */
  governanceTag: string | null;
  /** Truth layers: Governance, Provenance, Functional (product semantics) */
  truthTags: BaselineTruthTag[];
  /** Truthful API baseline_summary when present */
  backendSummary: string | null;
};

const ANGLE_COPY: Record<
  string,
  {
    expectation: string;
    category: string;
    governsWhat: string;
    role: BaselinePresentationRole;
    governanceTag: string | null;
  }
> = {
  model_identity_integrity: {
    category: "Identity & version",
    governsWhat: "Which model this subject is, and which governed version produced outputs.",
    expectation:
      "The event’s declared model name and version must match what baselines require — no silent swaps in a governed chain.",
    role: "both",
    governanceTag: "Identity & lineage",
  },
  policy_integrity: {
    category: "Policy",
    governsWhat: "Rules and posture (tags, constraints) that must hold for work done under this subject.",
    expectation:
      "Declared policy on the event must match the active posture: what is allowed, denied, or mandatory for this rail.",
    role: "governance",
    governanceTag: "Policy conformance",
  },
  operational_integrity: {
    category: "Operational",
    governsWhat: "Whether the run was healthy — status, timing, and error signals for the action being proven.",
    expectation:
      "Operational fields must show a successful execution inside the envelope your baselines define (no hidden failure modes).",
    role: "governance",
    governanceTag: "Operational health",
  },
  retrieval_integrity: {
    category: "Retrieval",
    governsWhat: "Evidence and sources the model or agent relied on, when you require grounding.",
    expectation:
      "When this angle is on, declared sources and evidence must meet your sufficiency rules — not just “has text”.",
    role: "both",
    governanceTag: "Grounding & evidence",
  },
  deterministic_integrity: {
    category: "Determinism",
    governsWhat: "Repeatability signals (digests, config) when contracts require stable behavior.",
    expectation:
      "When enabled, repeatability signals must stay inside the contract — auditors can reconcile runs over time.",
    role: "governance",
    governanceTag: "Repeatability",
  },
  identity_access_integrity: {
    category: "Access",
    governsWhat: "Who invoked the endpoint and under which scopes — critical for governed API traffic.",
    expectation:
      "Actor, scope, and access context on the event must satisfy the authentication and authorization contract.",
    role: "governance",
    governanceTag: "AuthN / AuthZ",
  },
  cross_system_integrity: {
    category: "Cross-system",
    governsWhat: "References and consistency across systems feeding this subject (IDs, relations, hand-offs).",
    expectation:
      "The event must stay coherent with the related systems and references your governance model expects.",
    role: "both",
    governanceTag: "Cross-system consistency",
  },
};

const RAIL_WHY: Record<string, string> = {
  model:
    "On the model rail, you prove model identity, policy posture, healthy execution, and declared retrieval/grounding when this angle is active by default.",
  agent:
    "On the agent rail, you prove policy, operational health, access/scopes, and tool↔agent cross-system linkage for orchestrated work.",
  service:
    "On the service rail, you prove operations, policy, authenticated access, and deterministic request behavior for each action.",
  endpoint:
    "On the endpoint rail, you prove identity and access, operational path, policy boundaries, and deterministic handling for API traffic.",
  system:
    "On the system rail, you prove operations, policy, cross-system coordination, and end-to-end access posture across the footprint.",
};

function roleLabel(role: BaselinePresentationRole): string {
  if (role === "governance") return "Primarily governance (rules & enforcement).";
  if (role === "provenance") return "Primarily provenance (identity & lineage).";
  return "Governance and provenance — enforcement plus identity/lineage expectations.";
}

function truthTagLine(tags: BaselineTruthTag[]): string {
  if (tags.length === 0) return "";
  return ` Truth layers: ${tags.join(" · ")}.`;
}

export type DemoBaselineTier = "default_active" | "optional";

export function getDemoBaselinePresentation(
  rail: string,
  angle: string,
  row: Pick<AngleSummary, "enabled" | "required" | "baseline_summary">,
  tier: DemoBaselineTier = "default_active",
): DemoBaselinePresentation {
  const r = rail?.trim() || "system";
  const base = ANGLE_COPY[angle] ?? {
    category: "Governance",
    governsWhat: "Structured integrity of the evaluated event for this subject.",
    expectation: "This angle applies the subject’s integrity rules for the event under evaluation.",
    role: "governance" as BaselinePresentationRole,
    governanceTag: "Governance",
  };
  const activeDefault = isAngleActiveByDefaultForRail(r, angle);
  const whyRail = RAIL_WHY[r] ?? RAIL_WHY.system!;
  const tags = truthTagsForAngle(angle);

  let whyMatters = `${whyRail} ${roleLabel(base.role)}${truthTagLine(tags)}`;
  if (tier === "optional") {
    whyMatters = `${whyMatters} This angle is provisioned but off by default — enable it when your assurance scope requires it.`;
  } else if (activeDefault && row.enabled) {
    whyMatters = `${whyMatters} It is in the rail’s default active set and is on for this subject.`;
  } else if (activeDefault && !row.enabled) {
    whyMatters = `${whyMatters} It is normally part of the default set for this rail but is currently off.`;
  } else {
    whyMatters = `${whyMatters} Optional for this rail — turn it on when you need that layer of proof.`;
  }

  const backendSummary =
    typeof row.baseline_summary === "string" && row.baseline_summary.trim() !== ""
      ? row.baseline_summary.trim()
      : null;

  return {
    category: base.category,
    governsWhat: base.governsWhat,
    expectation: base.expectation,
    whyMatters,
    role: base.role,
    governanceTag: base.governanceTag,
    truthTags: tags,
    backendSummary,
  };
}
