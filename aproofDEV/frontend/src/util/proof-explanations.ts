/**
 * Human-readable copy for proof / failure reason codes (additive UX layer).
 */

/** Short string for panels when the API returns structured JSON (keep honest; truncate only for layout). */
export function summarizeUnknownForProduct(value: unknown, max = 320): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    return t.length > max ? `${t.slice(0, max)}…` : t;
  }
  try {
    const s = JSON.stringify(value);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return null;
  }
}

export function explainAngleReasonCode(code: string): { label: string; fix: string } {
  const c = code.trim().toUpperCase();
  const table: Record<string, { label: string; fix: string }> = {
    BASELINE_MISSING: {
      label: "Baseline not found for this angle",
      fix: "Ensure the subject has an active baseline for this angle, or send an event whose payload satisfies baseline derivation for all required fields.",
    },
    NO_BASELINE_SOURCE: {
      label: "No baseline source material",
      fix: "Enrich the event payload with the fields your rail requires for baseline derivation (see starter payload in onboarding).",
    },
    NO_SOURCES: {
      label: "No sources or evidence",
      fix: "Add evidence-bearing fields to the payload or adjust mapping so this angle receives evaluable inputs.",
    },
    NOT_APPLICABLE: {
      label: "Not applicable for this event",
      fix: "No change needed unless you expect this angle to apply; verify canonical event type and subject rail.",
    },
    NOT_EVALUATED: {
      label: "Not evaluated",
      fix: "Retry after a successful proof build, or contact support if this persists.",
    },
    INSUFFICIENT_EVIDENCE: {
      label: "Insufficient evidence for a definitive result",
      fix: "Provide the fields this angle needs, or adjust baselines so expectations match what you ingest.",
    },
    REQUIRED_SOURCE_MISSING: {
      label: "Required sources missing",
      fix: "Send the evidence or mapping this angle requires, or turn the angle off if it should not apply.",
    },
    PASS_WITHOUT_BASELINE: {
      label: "Pass recorded without a full baseline row",
      fix: "Add a proper baseline for this angle if you need strict governance completeness.",
    },
    ANGLE_DISABLED: {
      label: "Angle disabled in baseline config",
      fix: "Enable the angle in baselines if this subject should be evaluated on it.",
    },
    ZERION_INTEGRATION_NOT_READY: {
      label: "Zerion integration prerequisites missing (API key, CLI path, wallet, or RPC)",
      fix: "Configure server env for Zerion CLI and Solana RPC; see Settings → Zerion Agent integration.",
    },
    ZERION_CLI_EXECUTION_FAILED: {
      label: "Forked Zerion CLI exited with an error",
      fix: "Inspect CLI stderr on the API host, verify Zerion API credentials and devnet wallet funding.",
    },
    ZERION_TX_HASH_MISSING: {
      label: "CLI succeeded but no transaction signature was parsed from stdout",
      fix: "Ensure the forked CLI prints JSON with tx_hash or signature when using --json.",
    },
    ZERION_CLI_TIMEOUT: {
      label: "Zerion CLI timed out",
      fix: "Retry with a faster RPC or increase CLI-side timeouts; check network connectivity.",
    },
    ZERION_CLI_INVALID_OUTPUT: {
      label: "Zerion CLI stdout was not valid structured output",
      fix: "Fix the CLI to emit a single JSON object with tx_hash or signature on success.",
    },
    ZERION_POLICY_BLOCKED: {
      label: "Execution blocked by scoped policy",
      fix: "Adjust the proposed chain, asset, spend, or policy window to satisfy active Zerion policy.",
    },
    POLICY_CHAIN_NOT_ALLOWED: {
      label: "Proposed chain is not in the allowed policy",
      fix: "Use the configured allowed chain (e.g. solana-devnet) or update ZERION_ALLOWED_CHAIN with governance.",
    },
    POLICY_SPEND_LIMIT_EXCEEDED: {
      label: "Proposed spend exceeds ZERION_MAX_SPEND_USD",
      fix: "Lower the action amount or raise the spend cap with proper approval.",
    },
    POLICY_ASSET_NOT_APPROVED: {
      label: "Asset is not in ZERION_APPROVED_ASSETS",
      fix: "Use an approved asset or update the approved list under governance.",
    },
    POLICY_EXPIRED: {
      label: "Policy validity window has expired for this action time",
      fix: "Refresh policy_valid_until / policy bundle so the action remains within an active window.",
    },
  };
  return (
    table[c] ?? {
      label: humanizeReasonToken(code),
      fix: "Open the linked proof and angle rows to see the exact diff the engine recorded.",
    }
  );
}

function humanizeReasonToken(code: string): string {
  const t = code.replace(/_/g, " ").trim();
  if (!t) return code;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function explainFailureReasonCode(code: string): { label: string; fix: string } {
  return explainAngleReasonCode(code);
}

export function baselineUxState(a: {
  baseline_present?: boolean;
  baseline_status?: string;
  baseline_source?: string;
  sources_state?: string;
  reason_code?: string;
}): "configured" | "derived" | "missing" | "no sources" {
  if (a.sources_state === "no sources" || a.reason_code === "NO_SOURCES") return "no sources";
  if (a.baseline_present === true || a.baseline_status === "present") {
    return a.baseline_source === "declared" || a.baseline_source === "policy" ? "configured" : "derived";
  }
  if (a.baseline_status === "missing" || a.reason_code === "BASELINE_MISSING") return "missing";
  if (!a.baseline_status || a.baseline_status === "insufficient") return "missing";
  return "derived";
}
