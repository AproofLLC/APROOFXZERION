const API_PREFIX = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

/**
 * Resolve the URL for `fetch`. When `VITE_API_BASE_URL` is unset, paths stay relative so the
 * browser talks to the Vite dev server origin and the dev proxy forwards to the API (see
 * `frontend/vite.config.ts`). Set `VITE_API_BASE_URL` for explicit deployments (e.g. staging URL).
 */
export function resolveRequestUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_PREFIX ? `${API_PREFIX}${p}` : p;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Request path (e.g. `/settings/organization`) for debugging. */
    public readonly requestPath?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const defaultHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  /** Internal proof-engine envelope (full product_proof, angles, rollup). */
  "x-proof-view": "internal",
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(resolveRequestUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      ...defaultHeaders,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const err = body as { ok?: boolean; error?: { code?: string; message?: string } } | null;
    const code = err && typeof err === "object" && err.error?.code ? err.error.code : "HTTP_ERROR";
    let message =
      err && typeof err === "object" && err.error?.message
        ? err.error.message
        : typeof body === "string"
          ? body
          : res.statusText;
    if (res.status >= 500) {
      message = `${message} (HTTP ${res.status} ${path})`;
    }
    throw new ApiError(res.status, code, message, path);
  }
  return body as T;
}
