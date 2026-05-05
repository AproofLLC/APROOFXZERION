import type { ReactNode } from "react";

/** Backend `null` / missing optional scalar → dashboard copy (overview / proof detail). */
export function truthScalar(value: unknown): string {
  if (value === null || value === undefined) return "No data";
  if (typeof value === "string" && value.length === 0) return "No data";
  return String(value);
}

/** Field absent from contract for this resource (e.g. not on this endpoint). */
export function truthNotOnResponse(): string {
  return "Not available";
}

export function truthJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return truthScalar(value);
  }
}

function parseApiInstant(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (s === "") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format an API ISO-8601 (or parseable) instant in the user's local timezone and locale —
 * matches what people expect as "system time" on their machine.
 */
export function formatLocalDateTime(value: unknown): string {
  const d = parseApiInstant(value);
  if (!d) return truthScalar(value);
  // Do not mix `dateStyle` / `timeStyle` with `timeZoneName` — engines throw (Invalid option).
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

/** Compact two lines for tables: date line + time line with local timezone abbreviation. */
export function formatLocalDateAndTimeLines(value: unknown): { dateLine: string; timeLine: string } | null {
  const d = parseApiInstant(value);
  if (!d) return null;
  const dateLine = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
  const timeLine = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(d);
  return { dateLine, timeLine };
}

export function TruthRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="py-2 border-b border-border text-sm last:border-b-0 space-y-1">
      <div className="text-muted-foreground break-words">{label}</div>
      <div className="font-mono text-xs break-all text-foreground">{value}</div>
    </div>
  );
}

export function TruthSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</h3>
      <div className="p-4 rounded-lg border border-border bg-card">{children}</div>
    </section>
  );
}
