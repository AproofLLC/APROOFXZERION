/**
 * Stable success JSON for POST /sandbox/session.
 * Session material is cookie-only (`aproof_session`); this body never includes tokens or key hashes.
 */

export const SANDBOX_SESSION_SUCCESS_JSON_KEYS = [
  "ok",
  "sandbox",
  "user_id",
  "organization_id",
  "environment_id",
  "environment_mode",
  "expires_at",
] as const;

/** Present only when `template` was requested and bootstrap succeeded. */
export const SANDBOX_SESSION_BOOTSTRAP_JSON_KEYS = [
  "template",
  "primary_subject_id",
  "subject_ids",
  "subject_ids_by_rail",
] as const;

export function buildSandboxSessionSuccessBody(params: {
  user_id: string;
  organization_id: string;
  environment_id: string;
  expires_at: string;
  bootstrap?: {
    template: string;
    primary_subject_id: string;
    subject_ids: string[];
    subject_ids_by_rail?: Record<string, string>;
  };
}): {
  ok: true;
  sandbox: true;
  user_id: string;
  organization_id: string;
  environment_id: string;
  environment_mode: "testnet";
  expires_at: string;
  template?: string;
  primary_subject_id?: string;
  subject_ids?: string[];
  subject_ids_by_rail?: Record<string, string>;
} {
  const base = {
    ok: true as const,
    sandbox: true as const,
    user_id: params.user_id,
    organization_id: params.organization_id,
    environment_id: params.environment_id,
    environment_mode: "testnet" as const,
    expires_at: params.expires_at,
  };
  if (!params.bootstrap) return base;
  const out = {
    ...base,
    template: params.bootstrap.template,
    primary_subject_id: params.bootstrap.primary_subject_id,
    subject_ids: params.bootstrap.subject_ids,
  };
  if (params.bootstrap.subject_ids_by_rail && Object.keys(params.bootstrap.subject_ids_by_rail).length > 0) {
    return { ...out, subject_ids_by_rail: params.bootstrap.subject_ids_by_rail };
  }
  return out;
}
