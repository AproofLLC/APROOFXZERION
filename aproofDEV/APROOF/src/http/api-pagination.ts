export type ApiPageMeta = {
  limit: number;
  offset: number;
  total: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parseLimitOffset(
  query: Record<string, string | string[] | undefined>
): { limit: number; offset: number } {
  const rawLimit = Array.isArray(query.limit) ? query.limit[0] : query.limit;
  const rawOffset = Array.isArray(query.offset) ? query.offset[0] : query.offset;
  const parsedLimit = parseInt(String(rawLimit ?? ""), 10);
  const parsedOffset = parseInt(String(rawOffset ?? ""), 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, parsedLimit))
    : DEFAULT_LIMIT;
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  return { limit, offset };
}

export function pageMeta(limit: number, offset: number, total: number): ApiPageMeta {
  return { limit, offset, total };
}
