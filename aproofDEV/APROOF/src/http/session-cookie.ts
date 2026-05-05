/** Central session cookie `Set-Cookie` line: HttpOnly, SameSite=Lax, Path=/, Max-Age, optional Secure. */

const SESSION_MAX_AGE_SEC = 7 * 24 * 3600;

function cookieSecureEnabled(): boolean {
  const v = process.env.APROOF_COOKIE_SECURE?.trim().toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function buildSessionSetCookieHeader(sessionTokenPlain: string): string {
  const parts = [
    `aproof_session=${sessionTokenPlain}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
  ];
  if (cookieSecureEnabled()) parts.push("Secure");
  return parts.join("; ");
}

export function buildSessionClearCookieHeader(): string {
  const parts = ["aproof_session=", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (cookieSecureEnabled()) parts.push("Secure");
  return parts.join("; ");
}

export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_SEC;
