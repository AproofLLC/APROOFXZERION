/**
 * Scoped policy gate before Zerion CLI execution (fail closed).
 */
import {
  readZerionAllowedChainFromEnv,
  readZerionApprovedAssetsFromEnv,
  readZerionMaxSpendUsdFromEnv,
} from "../demo/demo-clean-payloads.js";

export const ZERION_POLICY_REASON_CODES = [
  "POLICY_CHAIN_NOT_ALLOWED",
  "POLICY_SPEND_LIMIT_EXCEEDED",
  "POLICY_ASSET_NOT_APPROVED",
  "POLICY_EXPIRED",
  "ZERION_GOD_MODE_FORBIDDEN",
] as const;

export type ZerionPolicyReasonCode = (typeof ZERION_POLICY_REASON_CODES)[number];

export type ZerionPolicyGateInput = {
  /** Intended chain for the action (e.g. solana-devnet). */
  intended_chain: string;
  /** Spend in USD for the proposed action. */
  spend_usd: number;
  /** Asset symbol, e.g. SOL, USDC. */
  asset: string;
  /** If true, gate rejects (no god-mode execution). */
  god_mode?: boolean;
  /** ISO timestamp — policy must still be valid at this instant. */
  occurred_at: Date;
  /** ISO timestamp upper bound for policy validity (required for expiry check). */
  policy_valid_until_iso: string;
};

export type ZerionPolicyGateResult =
  | { ok: true }
  | { ok: false; reason_code: ZerionPolicyReasonCode | "POLICY_EXPIRED" };

function normalizeAsset(a: string): string {
  return a.trim().toUpperCase();
}

function normalizeChain(c: string): string {
  return c.trim().toLowerCase();
}

export function evaluateZerionScopedPolicy(input: ZerionPolicyGateInput): ZerionPolicyGateResult {
  if (input.god_mode === true) {
    return { ok: false, reason_code: "ZERION_GOD_MODE_FORBIDDEN" };
  }

  const allowedChain = normalizeChain(readZerionAllowedChainFromEnv());
  if (normalizeChain(input.intended_chain) !== allowedChain) {
    return { ok: false, reason_code: "POLICY_CHAIN_NOT_ALLOWED" };
  }

  const maxSpend = readZerionMaxSpendUsdFromEnv();
  if (!Number.isFinite(input.spend_usd) || input.spend_usd < 0 || input.spend_usd > maxSpend) {
    return { ok: false, reason_code: "POLICY_SPEND_LIMIT_EXCEEDED" };
  }

  const approved = new Set(readZerionApprovedAssetsFromEnv().map(normalizeAsset));
  if (!approved.has(normalizeAsset(input.asset))) {
    return { ok: false, reason_code: "POLICY_ASSET_NOT_APPROVED" };
  }

  const validUntil = new Date(input.policy_valid_until_iso);
  if (Number.isNaN(validUntil.getTime()) || input.occurred_at.getTime() > validUntil.getTime()) {
    return { ok: false, reason_code: "POLICY_EXPIRED" };
  }

  return { ok: true };
}
