import { formatDistanceToNow, parseISO } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { SubjectUserLog } from "../../../api/types";
import { useUserLogs, type UserLogListFilters } from "../../../hooks/useUserLogs";
import { useUserLogSummary } from "../../../hooks/useUserLogSummary";
import { QuerySectionError } from "../QuerySectionError";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { LoadingState } from "../ui/loading-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { truthScalar } from "./truth-display";

function relBadge(log: SubjectUserLog): string[] {
  const tags: string[] = [];
  if (log.related_proof_id) tags.push("proof");
  if (log.related_event_id) tags.push("event");
  if (log.related_lineage_id) tags.push("lineage");
  return tags;
}

function MetadataBlock({ meta }: { meta: Record<string, unknown> }) {
  const keys = Object.keys(meta);
  if (keys.length === 0) {
    return <p className="text-xs text-muted-foreground">No metadata keys.</p>;
  }
  return (
    <pre className="text-xs font-mono bg-muted/40 rounded-md p-3 overflow-x-auto max-h-48">
      {JSON.stringify(meta, null, 2)}
    </pre>
  );
}

function LogRow({ log }: { log: SubjectUserLog }) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const rel = relBadge(log);
  let when = log.occurred_at;
  try {
    when = formatDistanceToNow(parseISO(log.occurred_at), { addSuffix: true });
  } catch {
    /* keep ISO */
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-border rounded-lg bg-card">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,8rem)_1fr_auto] gap-2 md:gap-4 p-3 items-start">
        <div className="text-xs text-muted-foreground font-mono shrink-0 pt-0.5">
          <span className="md:hidden text-[10px] uppercase tracking-wide">Time · </span>
          {when}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="text-sm font-medium leading-snug">{truthScalar(log.action_title)}</div>
          {log.summary ? (
            <p className="text-xs text-muted-foreground line-clamp-3">{log.summary}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 justify-end">
          {log.source ? (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {log.source}
            </Badge>
          ) : null}
          {log.actor_type || log.actor_id ? (
            <Badge variant="outline" className="text-[10px] font-normal">
              {log.actor_type ?? "actor"}
              {log.actor_id ? ` · ${log.actor_id.slice(0, 8)}…` : ""}
            </Badge>
          ) : null}
          {rel.map((t) => (
            <Badge key={t} variant="outline" className="text-[10px] font-mono font-normal">
              {t}
            </Badge>
          ))}
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="sr-only">Toggle details</span>
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent>
        <div className="px-3 pb-3 pt-0 space-y-4 border-t border-border/60 mt-1">
          <div className="space-y-1 text-xs">
            <div>
              <span className="text-muted-foreground">action_type · </span>
              <span className="font-mono">{truthScalar(log.action_type)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">occurred_at · </span>
              <span className="font-mono">{truthScalar(log.occurred_at)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">source · </span>
              {truthScalar(log.source)}
            </div>
            <div>
              <span className="text-muted-foreground">actor · </span>
              {log.actor_type || log.actor_id ? (
                <span className="font-mono">
                  {truthScalar(log.actor_type)} {log.actor_id ? `(${log.actor_id})` : ""}
                </span>
              ) : (
                "—"
              )}
            </div>
          </div>
          {(log.related_proof_id ||
            log.related_event_id ||
            log.related_lineage_id ||
            log.trace_id) && (
            <div className="space-y-1 text-xs">
              <div className="font-medium text-foreground">Relations</div>
              {log.related_proof_id ? (
                <div className="font-mono break-all">
                  <span className="text-muted-foreground">proof_id · </span>
                  {log.related_proof_id}
                </div>
              ) : null}
              {log.related_event_id ? (
                <div className="font-mono break-all">
                  <span className="text-muted-foreground">event_id · </span>
                  {log.related_event_id}
                </div>
              ) : null}
              {log.related_lineage_id ? (
                <div className="font-mono break-all">
                  <span className="text-muted-foreground">lineage_id · </span>
                  {log.related_lineage_id}
                </div>
              ) : null}
              {log.trace_id ? (
                <div className="font-mono break-all">
                  <span className="text-muted-foreground">trace_id · </span>
                  {log.trace_id}
                </div>
              ) : null}
            </div>
          )}
          <div className="space-y-1">
            <div className="text-xs font-medium">Metadata</div>
            <MetadataBlock meta={log.metadata} />
          </div>
          {log.raw_payload != null && Object.keys(log.raw_payload).length > 0 ? (
            <div className="space-y-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowRaw((v) => !v)}
              >
                {showRaw ? "Hide raw data" : "Show raw data"}
              </Button>
              {showRaw ? (
                <pre className="text-xs font-mono bg-muted/40 rounded-md p-3 overflow-x-auto max-h-64">
                  {JSON.stringify(log.raw_payload, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ProofsUserLogs({ subjectId }: { subjectId: string }) {
  const summaryQ = useUserLogSummary(subjectId);
  const [q, setQ] = useState("");
  const [actionType, setActionType] = useState("");
  const [relation, setRelation] = useState<UserLogListFilters["relation"]>("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  const filters = useMemo<UserLogListFilters>(
    () => ({
      q: q.trim() || undefined,
      action_type: actionType.trim() || undefined,
      relation: relation || undefined,
      sort,
      limit: 50,
    }),
    [q, actionType, relation, sort],
  );

  const listQ = useUserLogs(subjectId, filters);
  const items = listQ.data?.pages.flatMap((p) => p.items) ?? [];
  const hasNext = listQ.hasNextPage;

  if (summaryQ.isLoading) {
    return <LoadingState message="Loading user logs…" />;
  }
  if (summaryQ.error) {
    return <QuerySectionError error={summaryQ.error as Error} title="User logs unavailable" />;
  }

  const s = summaryQ.data;
  if (!s) {
    return <QuerySectionError error={new Error("Empty summary")} title="User logs unavailable" />;
  }

  let latestWhen: string | null = s.latest_activity.occurred_at;
  if (s.latest_activity.occurred_at) {
    try {
      latestWhen = formatDistanceToNow(parseISO(s.latest_activity.occurred_at), { addSuffix: true });
    } catch {
      /* keep */
    }
  }

  const previewSources = s.distinct_sources.slice(0, 3);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium mb-1">User Logs</h1>
        <p className="text-sm text-muted-foreground">Activity that occurred inside this subject.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Separate from proof-generating events (see Events). Ingested activity only; not proof outputs.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{s.total_logs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Latest Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium leading-snug">{truthScalar(s.latest_activity.action_title) || "—"}</p>
            <p className="text-xs text-muted-foreground">{latestWhen ?? "—"}</p>
            {s.latest_activity.source ? (
              <p className="text-xs text-muted-foreground">Source · {s.latest_activity.source}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-semibold tabular-nums">{s.distinct_sources.length}</p>
            {previewSources.length > 0 ? (
              <p className="text-xs text-muted-foreground">{previewSources.join(" · ")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-end">
        <div className="space-y-1 flex-1 min-w-[160px]">
          <Label htmlFor="user-log-search">Search</Label>
          <Input
            id="user-log-search"
            placeholder="Title, summary, type, source…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="space-y-1 w-full sm:w-40">
          <Label htmlFor="user-log-type">Type</Label>
          <Input
            id="user-log-type"
            placeholder="action_type"
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
          />
        </div>
        <div className="space-y-1 w-full sm:w-44">
          <Label>Relations</Label>
          <Select
            value={relation || "__all"}
            onValueChange={(v) => setRelation(v === "__all" ? "" : (v as UserLogListFilters["relation"]))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Any</SelectItem>
              <SelectItem value="none">No relations</SelectItem>
              <SelectItem value="any">Has any relation</SelectItem>
              <SelectItem value="has_proof">Has proof</SelectItem>
              <SelectItem value="has_event">Has event</SelectItem>
              <SelectItem value="has_lineage">Has lineage</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 w-full sm:w-36">
          <Label>Sort</Label>
          <Select value={sort} onValueChange={(v) => setSort(v as "newest" | "oldest")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {listQ.isLoading ? (
        <LoadingState message="Loading entries…" />
      ) : listQ.error ? (
        <QuerySectionError error={listQ.error as Error} title="Could not load user logs" />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">No user logs for this subject yet.</p>
          <p>When activity is ingested for this subject, it will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((log) => (
            <LogRow key={log.user_log_id} log={log} />
          ))}
          {hasNext ? (
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={listQ.isFetchingNextPage}
                onClick={() => listQ.fetchNextPage()}
              >
                {listQ.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
