import { createHash } from "node:crypto";

/** Deterministic JSON: sort object keys recursively (spec §12 raw_payload_hash). */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

export function rawPayloadHashFromPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
}

/** canonical_hash = SHA256({ event_id, trace_id, subject_id, event_type, occurred_at }) with sorted keys; occurred_at ISO. */
export function canonicalHashFields(input: {
  event_id: string;
  trace_id: string;
  subject_id: string;
  event_type: string;
  occurred_at: string;
}): string {
  const body = {
    event_id: input.event_id,
    event_type: input.event_type,
    occurred_at: input.occurred_at,
    subject_id: input.subject_id,
    trace_id: input.trace_id,
  };
  return createHash("sha256").update(stableStringify(body), "utf8").digest("hex");
}

/** logical_hash = SHA256({ subject_id, event_type, payload }) with sorted keys. */
export function logicalHashFields(input: {
  subject_id: string;
  event_type: string;
  payload: Record<string, unknown>;
}): string {
  const body = {
    event_type: input.event_type,
    subject_id: input.subject_id,
    payload: input.payload,
  };
  return createHash("sha256").update(stableStringify(body), "utf8").digest("hex");
}
