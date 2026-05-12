import type { CanonicalAngleKey } from "../../constants/proof-engine";
import { CANONICAL_ANGLE_KEYS } from "../../constants/proof-engine";

/** Static judge-facing copy for each deterministic integrity angle (not derived from API or LLMs). */
export type AngleExplanation = {
  title: string;
  purpose: string;
  runtimeMeaning: string;
  whyItMatters: string;
};

export const ANGLE_EXPLANATIONS: Record<CanonicalAngleKey, AngleExplanation> = {
  policy_integrity: {
    title: "Policy Integrity",
    purpose:
      "Evaluates whether the autonomous execution was allowed under scoped governance and execution policy.",
    runtimeMeaning:
      "Checks chain restrictions, approved assets, spend constraints, and no-god-mode policy rules before execution.",
    whyItMatters: "Prevents autonomous agents from executing outside approved operational boundaries.",
  },
  identity_access_integrity: {
    title: "Identity & Access Integrity",
    purpose: "Evaluates whether the executing wallet or principal was authorized for the requested action.",
    runtimeMeaning:
      "Checks that the Zerion Agent execution wallet matches an approved execution identity and access scope.",
    whyItMatters: "Ensures only approved autonomous actors can execute governed actions.",
  },
  operational_integrity: {
    title: "Operational Integrity",
    purpose: "Evaluates whether the execution lifecycle completed successfully.",
    runtimeMeaning:
      "Checks CLI invocation, execution attempts, runtime errors, tx generation, and operational outcomes.",
    whyItMatters: "Ensures the execution path functioned correctly and remained observable.",
  },
  model_identity_integrity: {
    title: "Runtime Identity Integrity",
    purpose: "Evaluates whether the execution occurred through the expected governed runtime channel.",
    runtimeMeaning:
      "Checks that the Zerion CLI execution path and runtime identity remain coherent with the configured subject.",
    whyItMatters: "Ensures autonomous actions originate from the expected execution environment.",
  },
  retrieval_integrity: {
    title: "Retrieval Integrity",
    purpose: "Evaluates whether the governance and evaluation inputs were available and traceable.",
    runtimeMeaning:
      "Checks that policy/configuration sources used during evaluation were present and sufficiently resolved.",
    whyItMatters:
      "Ensures proofs are generated from traceable governance inputs rather than missing or ambiguous sources.",
  },
  deterministic_integrity: {
    title: "Deterministic Integrity",
    purpose: "Evaluates whether proof generation and evaluation remained reproducible and canonically ordered.",
    runtimeMeaning: "Checks stable digest generation, canonical ordering, and deterministic evaluation behavior.",
    whyItMatters: "Ensures proof outputs remain consistent and reproducible across evaluations.",
  },
  cross_system_integrity: {
    title: "Cross-System Integrity",
    purpose: "Evaluates whether all participating systems aligned coherently during execution.",
    runtimeMeaning:
      "Checks consistency between Zerion execution, wallet activity, AProof ingest, proof generation, and Solana anchoring.",
    whyItMatters: "Ensures the autonomous execution lifecycle remained systemically coherent end-to-end.",
  },
};

/** All canonical keys that have a static explanation (seven angles). */
export const ANGLE_EXPLANATION_KEYS = CANONICAL_ANGLE_KEYS;

export function getAngleExplanation(angleKey: string): AngleExplanation | null {
  if (angleKey in ANGLE_EXPLANATIONS) {
    return ANGLE_EXPLANATIONS[angleKey as CanonicalAngleKey];
  }
  return null;
}
