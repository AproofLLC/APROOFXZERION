export type GateContext = {
  organizationId: string;
  environmentId: string;
  subjectId: string;
  subjectResolvedCount: number;
  mappingFound: boolean;
  eventId: string;
  eventLineageId: string;
  eventVersion: number;
  traceId: string;
  occurredAt: Date;
};

export type GateResult =
  | { ok: true }
  | { ok: false; reason: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export function runProofabilityGate(ctx: GateContext): GateResult {
  if (ctx.subjectResolvedCount !== 1) {
    return { ok: false, reason: "subject_not_unique_or_missing" };
  }
  if (!ctx.mappingFound) {
    return { ok: false, reason: "mapping_missing" };
  }
  if (!isUuid(ctx.eventId)) return { ok: false, reason: "invalid_event_id" };
  if (!isUuid(ctx.eventLineageId)) return { ok: false, reason: "invalid_event_lineage_id" };
  if (!Number.isInteger(ctx.eventVersion) || ctx.eventVersion <= 0) {
    return { ok: false, reason: "event_version_invalid" };
  }
  if (!ctx.traceId.trim()) return { ok: false, reason: "trace_id_empty" };
  if (Number.isNaN(ctx.occurredAt.getTime())) return { ok: false, reason: "occurred_at_invalid" };
  const now = Date.now();
  const skewMs = 5 * 60 * 1000;
  if (ctx.occurredAt.getTime() > now + skewMs) {
    return { ok: false, reason: "occurred_at_in_future" };
  }
  return { ok: true };
}
