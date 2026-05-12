import { describe, expect, it } from "vitest";
import { formatListenPortLogSuffix, resolveListenPortFromEnv } from "./runtime-env.js";

describe("resolveListenPortFromEnv", () => {
  it("uses PORT when set and valid", () => {
    const r = resolveListenPortFromEnv({ PORT: "3101" } as NodeJS.ProcessEnv);
    expect(r).toEqual({ port: 3101, source: "PORT" });
  });

  it("uses APROOF_PORT when PORT unset", () => {
    const r = resolveListenPortFromEnv({ APROOF_PORT: "3005" } as NodeJS.ProcessEnv);
    expect(r).toEqual({ port: 3005, source: "APROOF_PORT" });
  });

  it("PORT wins over APROOF_PORT", () => {
    const r = resolveListenPortFromEnv({
      PORT: "4000",
      APROOF_PORT: "5000",
    } as NodeJS.ProcessEnv);
    expect(r.port).toBe(4000);
    expect(r.source).toBe("PORT");
  });

  it("defaults to 3040", () => {
    const r = resolveListenPortFromEnv({} as NodeJS.ProcessEnv);
    expect(r).toEqual({ port: 3040, source: "default" });
  });

  it("ignores empty PORT and falls through", () => {
    const r = resolveListenPortFromEnv({
      PORT: "  ",
      APROOF_PORT: "3101",
    } as NodeJS.ProcessEnv);
    expect(r).toEqual({ port: 3101, source: "APROOF_PORT" });
  });
});

describe("formatListenPortLogSuffix", () => {
  it("formats default", () => {
    expect(formatListenPortLogSuffix("default")).toBe(" (default)");
  });
  it("formats env sources", () => {
    expect(formatListenPortLogSuffix("PORT")).toBe(" (from PORT)");
  });
});
