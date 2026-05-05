/**
 * Subject user logs — storage, batch ingest, list, summary.
 * Isolated from proof pipeline and canonical events.
 */
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import type { Db } from "../db/client.js";
import { subjectUserLogs } from "../db/schema/index.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_BATCH = 5000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type SubjectUserLogDto = {
  user_log_id: string;
  subject_id: string;
  organization_id: string;
  environment_id: string;
  occurred_at: string;
  action_type: string;
  action_title: string;
  summary: string | null;
  source: string | null;
  actor_id: string | null;
  actor_type: string | null;
  trace_id: string | null;
  related_event_id: string | null;
  related_proof_id: string | null;
  related_lineage_id: string | null;
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown> | null;
};

export type SubjectUserLogSummaryDto = {
  total_logs: number;
  latest_activity: {
    action_title: string | null;
    occurred_at: string | null;
    source: string | null;
  };
  distinct_sources: string[];
};

export type IngestUserLogInput = {
  user_log_id?: string;
  occurred_at: string;
  action_type: string;
  action_title: string;
  summary?: string | null;
  source?: string | null;
  actor_id?: string | null;
  actor_type?: string | null;
  trace_id?: string | null;
  related_event_id?: string | null;
  related_proof_id?: string | null;
  related_lineage_id?: string | null;
  metadata?: unknown;
  raw_payload?: unknown;
};

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function rowToDto(row: typeof subjectUserLogs.$inferSelect): SubjectUserLogDto {
  return {
    user_log_id: row.id,
    subject_id: row.subjectId,
    organization_id: row.organizationId,
    environment_id: row.environmentId,
    occurred_at: row.occurredAt.toISOString(),
    action_type: row.actionType,
    action_title: row.actionTitle,
    summary: row.summary ?? null,
    source: row.source ?? null,
    actor_id: row.actorId ?? null,
    actor_type: row.actorType ?? null,
    trace_id: row.traceId ?? null,
    related_event_id: row.relatedEventId ?? null,
    related_proof_id: row.relatedProofId ?? null,
    related_lineage_id: row.relatedLineageId ?? null,
    metadata: asObject(row.metadata),
    raw_payload: row.rawPayload == null ? null : asObject(row.rawPayload),
  };
}

function scopeWhere(
  organizationId: string,
  environmentId: string,
  subjectId: string
): ReturnType<typeof and> {
  return and(
    eq(subjectUserLogs.organizationId, organizationId),
    eq(subjectUserLogs.environmentId, environmentId),
    eq(subjectUserLogs.subjectId, subjectId)
  )!;
}

function searchPattern(q: string): string {
  const t = q.trim().replace(/[%_]/g, "");
  if (!t) return "";
  return `%${t}%`;
}

type RelationFilter = "any" | "none" | "has_proof" | "has_event" | "has_lineage" | "";

function relationPredicate(relation: RelationFilter | string): ReturnType<typeof and> | ReturnType<typeof or> | undefined {
  const r = String(relation ?? "").trim() as RelationFilter | "";
  if (!r) return undefined;
  if (r === "none") {
    return and(
      isNull(subjectUserLogs.relatedEventId),
      isNull(subjectUserLogs.relatedProofId),
      isNull(subjectUserLogs.relatedLineageId)
    )!;
  }
  if (r === "any") {
    return or(
      isNotNull(subjectUserLogs.relatedEventId),
      isNotNull(subjectUserLogs.relatedProofId),
      isNotNull(subjectUserLogs.relatedLineageId)
    );
  }
  if (r === "has_proof") return isNotNull(subjectUserLogs.relatedProofId);
  if (r === "has_event") return isNotNull(subjectUserLogs.relatedEventId);
  if (r === "has_lineage") return isNotNull(subjectUserLogs.relatedLineageId);
  return undefined;
}

export function encodeUserLogCursor(occurredAtIso: string, id: string): string {
  return Buffer.from(JSON.stringify({ t: occurredAtIso, id }), "utf8").toString("base64url");
}

export function decodeUserLogCursor(s: string): { t: string; id: string } | null {
  try {
    const j = JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as { t?: unknown; id?: unknown };
    if (typeof j.t === "string" && typeof j.id === "string" && isUuid(j.id)) return { t: j.t, id: j.id };
  } catch {
    /* ignore */
  }
  return null;
}

export async function ingestSubjectUserLogs(
  db: Db,
  params: {
    organizationId: string;
    environmentId: string;
    subjectId: string;
    logs: IngestUserLogInput[];
  }
): Promise<{ inserted: number } | { error: string; index?: number }> {
  const { organizationId, environmentId, subjectId, logs } = params;
  if (!Array.isArray(logs)) return { error: "Request body must include a logs array." };
  if (logs.length === 0) return { error: "logs array must not be empty." };
  if (logs.length > MAX_BATCH) return { error: `Batch exceeds maximum of ${MAX_BATCH} logs.` };

  const rows: (typeof subjectUserLogs.$inferInsert)[] = [];

  for (let i = 0; i < logs.length; i++) {
    const L = logs[i]!;
    const occurredRaw = L.occurred_at;
    const actionType = String(L.action_type ?? "").trim();
    const actionTitle = String(L.action_title ?? "").trim();
    if (!occurredRaw || !actionType || !actionTitle) {
      return { error: "Each log requires occurred_at, action_type, and action_title.", index: i };
    }
    const occurred = new Date(occurredRaw);
    if (Number.isNaN(occurred.getTime())) {
      return { error: "Invalid occurred_at (expected ISO-8601).", index: i };
    }

    let id = L.user_log_id?.trim();
    if (id) {
      if (!isUuid(id)) return { error: "user_log_id must be a valid UUID.", index: i };
    } else {
      id = randomUUID();
    }

    const optUuid = (v: unknown, field: string): string | null | { error: string; index: number } => {
      if (v == null || v === "") return null;
      const s = String(v).trim();
      if (!isUuid(s)) return { error: `${field} must be a valid UUID or null.`, index: i };
      return s;
    };

    const re = optUuid(L.related_event_id, "related_event_id");
    if (re && typeof re === "object" && "error" in re) return re;
    const rp = optUuid(L.related_proof_id, "related_proof_id");
    if (rp && typeof rp === "object" && "error" in rp) return rp;
    const rl = optUuid(L.related_lineage_id, "related_lineage_id");
    if (rl && typeof rl === "object" && "error" in rl) return rl;

    rows.push({
      id,
      organizationId,
      environmentId,
      subjectId,
      occurredAt: occurred,
      actionType,
      actionTitle,
      summary: L.summary == null || L.summary === "" ? null : String(L.summary),
      source: L.source == null || L.source === "" ? null : String(L.source),
      actorId: L.actor_id == null || L.actor_id === "" ? null : String(L.actor_id),
      actorType: L.actor_type == null || L.actor_type === "" ? null : String(L.actor_type),
      traceId: L.trace_id == null || L.trace_id === "" ? null : String(L.trace_id),
      relatedEventId: re as string | null,
      relatedProofId: rp as string | null,
      relatedLineageId: rl as string | null,
      metadata: asObject(L.metadata),
      rawPayload:
        L.raw_payload == null
          ? null
          : Array.isArray(L.raw_payload) || typeof L.raw_payload === "object"
            ? (L.raw_payload as object)
            : null,
    });
  }

  const CHUNK = 500;
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      await tx.insert(subjectUserLogs).values(slice);
    }
  });

  return { inserted: rows.length };
}

export type ListUserLogsParams = {
  organizationId: string;
  environmentId: string;
  subjectId: string;
  q?: string;
  action_type?: string;
  relation?: RelationFilter;
  sort?: "newest" | "oldest";
  limit?: number;
  cursor?: string;
};

export type UserLogsEnvironmentLabel = "production" | "testnet" | "sandbox" | string;

export type SubjectUserLogsReadEnvelope = {
  subject_id: string;
  environment: UserLogsEnvironmentLabel;
  logs: SubjectUserLogDto[];
  pagination: {
    limit: number;
    offset: number;
    next_cursor: string | null;
  };
  empty_reason: string | null;
  /** Legacy compatibility for existing consumers. */
  items: SubjectUserLogDto[];
  /** Legacy compatibility for existing consumers. */
  next_cursor?: string;
};

export async function listSubjectUserLogs(
  db: Db,
  params: ListUserLogsParams
): Promise<{ items: SubjectUserLogDto[]; next_cursor?: string }> {
  const {
    organizationId,
    environmentId,
    subjectId,
    q,
    action_type,
    relation,
    sort = "newest",
    cursor,
  } = params;
  const limit = Math.min(
    Math.max(1, params.limit ?? DEFAULT_LIMIT),
    MAX_LIMIT
  );

  const conds: (ReturnType<typeof and> | ReturnType<typeof or> | ReturnType<typeof ilike> | undefined)[] = [
    scopeWhere(organizationId, environmentId, subjectId),
  ];

  const sp = q ? searchPattern(q) : "";
  if (sp) {
    conds.push(
      or(
        ilike(subjectUserLogs.actionTitle, sp),
        ilike(subjectUserLogs.actionType, sp),
        ilike(subjectUserLogs.summary, sp),
        ilike(subjectUserLogs.source, sp)
      )!
    );
  }

  const at = action_type?.trim();
  if (at) {
    conds.push(eq(subjectUserLogs.actionType, at));
  }

  const relPred = relationPredicate(relation ?? "");
  if (relPred) conds.push(relPred);

  if (cursor) {
    const c = decodeUserLogCursor(cursor);
    if (!c) throw new Error("INVALID_USER_LOG_CURSOR");
    const cDate = new Date(c.t);
    if (Number.isNaN(cDate.getTime())) throw new Error("INVALID_USER_LOG_CURSOR");
    if (sort === "newest") {
      conds.push(
        or(lt(subjectUserLogs.occurredAt, cDate), and(eq(subjectUserLogs.occurredAt, cDate), lt(subjectUserLogs.id, c.id)))!
      );
    } else {
      conds.push(
        or(gt(subjectUserLogs.occurredAt, cDate), and(eq(subjectUserLogs.occurredAt, cDate), gt(subjectUserLogs.id, c.id)))!
      );
    }
  }

  const flat = conds.filter((x): x is SQL => x != null);
  const whereClause = and(...flat)!;

  const orderBy =
    sort === "oldest"
      ? [asc(subjectUserLogs.occurredAt), asc(subjectUserLogs.id)]
      : [desc(subjectUserLogs.occurredAt), desc(subjectUserLogs.id)];

  const rows = await db
    .select()
    .from(subjectUserLogs)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(rowToDto);

  let next_cursor: string | undefined;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1]!;
    next_cursor = encodeUserLogCursor(last.occurredAt.toISOString(), last.id);
  }

  return { items, next_cursor };
}

export async function getUserLogsForSubject(
  db: Db,
  params: ListUserLogsParams & {
    environmentLabel: UserLogsEnvironmentLabel;
    offset?: number;
  },
): Promise<SubjectUserLogsReadEnvelope> {
  const listed = await listSubjectUserLogs(db, params);
  const logs = listed.items;
  const nextCursor = listed.next_cursor ?? null;
  const limit = Math.min(Math.max(1, params.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, params.offset ?? 0);
  return {
    subject_id: params.subjectId,
    environment: params.environmentLabel,
    logs,
    pagination: {
      limit,
      offset,
      next_cursor: nextCursor,
    },
    empty_reason: logs.length === 0 ? "no_logs_for_subject" : null,
    items: logs,
    ...(listed.next_cursor ? { next_cursor: listed.next_cursor } : {}),
  };
}

export async function getSubjectUserLogSummary(
  db: Db,
  params: { organizationId: string; environmentId: string; subjectId: string }
): Promise<SubjectUserLogSummaryDto> {
  const { organizationId, environmentId, subjectId } = params;
  const base = scopeWhere(organizationId, environmentId, subjectId);

  const [countRow] = await db
    .select({ n: count() })
    .from(subjectUserLogs)
    .where(base);

  const total = Number(countRow?.n ?? 0);

  const [latest] = await db
    .select()
    .from(subjectUserLogs)
    .where(base)
    .orderBy(desc(subjectUserLogs.occurredAt), desc(subjectUserLogs.id))
    .limit(1);

  const sourceRows = await db
    .select({ source: subjectUserLogs.source })
    .from(subjectUserLogs)
    .where(and(base, isNotNull(subjectUserLogs.source), ne(subjectUserLogs.source, "")));

  const seen = new Set<string>();
  const distinct_sources: string[] = [];
  for (const r of sourceRows) {
    const s = r.source;
    if (typeof s === "string" && s.length > 0 && !seen.has(s)) {
      seen.add(s);
      distinct_sources.push(s);
    }
  }
  distinct_sources.sort((a, b) => a.localeCompare(b));

  return {
    total_logs: total,
    latest_activity: {
      action_title: latest?.actionTitle ?? null,
      occurred_at: latest ? latest.occurredAt.toISOString() : null,
      source: latest?.source ?? null,
    },
    distinct_sources,
  };
}
