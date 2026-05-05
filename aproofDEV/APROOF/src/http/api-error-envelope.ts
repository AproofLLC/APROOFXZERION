/**
 * API error contract (HTTP 4xx/5xx JSON bodies):
 * - Always `ok: false` at top level.
 * - `error.code` is a stable machine identifier (SCREAMING_SNAKE_CASE where possible).
 * - `error.message` is human-readable; never raw stack traces.
 * - `error.details` holds optional structured fields (reason codes, field names, locators).
 *
 * Success responses keep their existing shapes; only errors use this envelope.
 */

export type ApiErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export function apiErrorEnvelope(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiErrorEnvelope {
  const error: ApiErrorEnvelope["error"] = { code, message };
  if (details !== undefined && Object.keys(details).length > 0) {
    error.details = details;
  }
  return { ok: false, error };
}

/** Pipeline / ingest failures that return HTTP 422 with NOT_PROOFABLE semantics. */
export function notProofableApiError(params: {
  reason: string;
  raw_event_id: string;
  pipeline_code?: string;
}): ApiErrorEnvelope {
  return apiErrorEnvelope("NOT_PROOFABLE", params.reason, {
    reason: params.reason,
    raw_event_id: params.raw_event_id,
    ...(params.pipeline_code !== undefined ? { pipeline_code: params.pipeline_code } : {}),
  });
}
