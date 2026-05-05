import type { CanonicalEventType } from "./angle-applicability.js";

/**
 * Canonical event alias normalization.
 * Must be applied at ingress before routing/hash/storage/output decisions.
 */
export function normalizeCanonicalEventType(eventType: string): CanonicalEventType {
  if (eventType === "access_token_used") return "identity_access_checked";
  return eventType as CanonicalEventType;
}
