import { ApiError } from "../../api/client";

type Props = {
  error: Error;
  title?: string;
  className?: string;
};

/** Inline, non-blocking error surface for TanStack Query failures in dashboard sections. */
export function QuerySectionError({ error, title = "Could not load this section", className = "" }: Props) {
  const msg = error.message;
  const path = error instanceof ApiError ? error.requestPath : undefined;
  return (
    <div
      role="alert"
      className={`p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive ${className}`.trim()}
    >
      <div className="font-medium mb-1">{title}</div>
      <div className="text-destructive/90 break-words">{msg}</div>
      {path ? <div className="mt-2 text-xs font-mono text-muted-foreground opacity-90">{path}</div> : null}
    </div>
  );
}
