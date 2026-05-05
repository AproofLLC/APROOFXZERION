import { describe, expect, it } from "vitest";
import { cookieMutationCsrfAllowed } from "./csrf-cookie-mutation.js";

function req(partial: {
  method: string;
  cookie?: string;
  secFetchSite?: string;
}): Parameters<typeof cookieMutationCsrfAllowed>[0] {
  return {
    method: partial.method,
    headers: {
      cookie: partial.cookie,
      "sec-fetch-site": partial.secFetchSite,
    },
  } as Parameters<typeof cookieMutationCsrfAllowed>[0];
}

describe("cookieMutationCsrfAllowed", () => {
  it("allows safe methods even with session cookie and cross-site", () => {
    expect(
      cookieMutationCsrfAllowed(
        req({
          method: "GET",
          cookie: "aproof_session=abc",
          secFetchSite: "cross-site",
        }),
      ),
    ).toBe(true);
  });

  it("allows unsafe methods without session cookie", () => {
    expect(cookieMutationCsrfAllowed(req({ method: "POST" }))).toBe(true);
  });

  it("allows unsafe methods with session cookie when Sec-Fetch-Site is absent (non-browser clients)", () => {
    expect(
      cookieMutationCsrfAllowed(
        req({ method: "POST", cookie: "aproof_session=abc" }),
      ),
    ).toBe(true);
  });

  it("blocks unsafe methods with session cookie when Sec-Fetch-Site is cross-site", () => {
    expect(
      cookieMutationCsrfAllowed(
        req({
          method: "POST",
          cookie: "aproof_session=abc",
          secFetchSite: "cross-site",
        }),
      ),
    ).toBe(false);
  });

  it("allows same-origin with session cookie", () => {
    expect(
      cookieMutationCsrfAllowed(
        req({
          method: "PATCH",
          cookie: "aproof_session=abc",
          secFetchSite: "same-origin",
        }),
      ),
    ).toBe(true);
  });
});
