import type { MappingListItem } from "../../../hooks/useSubjectMappings";
import { Badge } from "../ui/badge";
import { LoadingState } from "../ui/loading-state";

export function MappingsPanel({
  items,
  loading,
  error,
}: {
  items: MappingListItem[] | undefined;
  loading: boolean;
  error: Error | null;
}) {
  if (loading) return <LoadingState message="Loading mappings…" />;
  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }
  const list = items ?? [];
  const def = list.filter((m) => m.is_default);

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="font-medium">Mappings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Each <code className="font-mono text-xs">source_type_key</code> from your integration is mapped to a
          canonical event type. A default mapping is provisioned when your first subject is created in an environment
          with no rules.
        </p>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Default mapping</div>
        {def.length === 0 ? (
          <p className="text-sm text-muted-foreground">No default mapping row.</p>
        ) : (
          <ul className="space-y-1 text-sm font-mono">
            {def.map((m) => (
              <li key={m.source_type_key}>
                {m.source_type_key} → {m.canonical_event_type}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">All configured mappings</div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {list.map((m) => (
            <li key={m.source_type_key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs font-mono">
              <span className="break-all">{m.source_type_key}</span>
              <span className="text-muted-foreground">→</span>
              <span>{m.canonical_event_type}</span>
              {m.is_default ? <Badge variant="secondary">default</Badge> : null}
              {!m.is_active ? <Badge variant="outline">inactive</Badge> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
