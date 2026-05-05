/**
 * Browsers send Sec-Fetch-Site on navigational/fetch requests. Cross-site POSTs from attacker
 * origins are marked "cross-site" while same-origin dashboard calls are "same-origin" or "same-site".
 * Block cookie-authenticated unsafe methods when explicitly cross-site (curl/tests omit header → allowed).
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { apiErrorEnvelope } from "./api-error-envelope.js";

const UNSAFE = new Set(["POST", "PATCH", "DELETE", "PUT"]);

function hasAproofSessionCookie(cookieHeader: string | undefined): boolean {
  return typeof cookieHeader === "string" && /(?:^|;\s*)aproof_session=[^;]+/.test(cookieHeader);
}

export function cookieMutationCsrfAllowed(request: FastifyRequest): boolean {
  const method = request.method?.toUpperCase() ?? "";
  if (!UNSAFE.has(method)) return true;
  if (!hasAproofSessionCookie(request.headers.cookie)) return true;
  const raw = request.headers["sec-fetch-site"];
  const sfs = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (sfs === "cross-site") return false;
  return true;
}

export function sendCookieCsrfBlocked(reply: FastifyReply): void {
  reply
    .status(403)
    .send(
      apiErrorEnvelope(
        "CSRF_BLOCKED",
        "This request was rejected because it appears to be a cross-site cookie-authenticated mutation. Use same-site navigation or a CSRF-safe client."
      )
    );
}
