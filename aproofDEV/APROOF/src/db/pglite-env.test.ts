import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getResolvedPgliteDataDirectory,
  isLikelyPgliteStorageCorruptionError,
  pgliteResetCliBlockedReason,
  resolvePgliteDataDirFromEnv,
} from "./pglite.js";

describe("resolvePgliteDataDirFromEnv precedence", () => {
  it("prefers PGLITE_DATA_DIR over APROOF_PGLITE_DATA_DIR", () => {
    const r = resolvePgliteDataDirFromEnv({
      PGLITE_DATA_DIR: "/first",
      APROOF_PGLITE_DATA_DIR: "/second",
    } as NodeJS.ProcessEnv);
    expect(r.dataDir).toBe("/first");
    expect(r.source).toBe("PGLITE_DATA_DIR");
  });

  it("uses APROOF_PGLITE_DATA_DIR when PGLITE unset", () => {
    const r = resolvePgliteDataDirFromEnv({
      APROOF_PGLITE_DATA_DIR: "/only-aproof",
    } as NodeJS.ProcessEnv);
    expect(r.dataDir).toBe("/only-aproof");
    expect(r.source).toBe("APROOF_PGLITE_DATA_DIR");
  });

  it("returns default when neither set", () => {
    const r = resolvePgliteDataDirFromEnv({} as NodeJS.ProcessEnv);
    expect(r.source).toBe("default");
    expect(r.dataDir).toContain("pglite");
  });
});

describe("getResolvedPgliteDataDirectory", () => {
  it("returns absolute path matching resolve + path.resolve", () => {
    const env = { PGLITE_DATA_DIR: "rel/pglite" } as NodeJS.ProcessEnv;
    const { dataDir } = resolvePgliteDataDirFromEnv(env);
    const { absolutePath } = getResolvedPgliteDataDirectory(env);
    expect(absolutePath).toBe(path.resolve(dataDir));
  });
});

describe("pgliteResetCliBlockedReason", () => {
  it("blocks when APROOF_DB_MODE is postgres", () => {
    const r = pgliteResetCliBlockedReason({
      APROOF_DB_MODE: "postgres",
      DATABASE_URL: "postgres://x",
    } as NodeJS.ProcessEnv);
    expect(r).toContain("not pglite");
  });

  it("blocks when DATABASE_URL set and mode unset", () => {
    const r = pgliteResetCliBlockedReason({
      DATABASE_URL: "postgres://x",
    } as NodeJS.ProcessEnv);
    expect(r).toContain("DATABASE_URL");
  });

  it("allows pglite mode", () => {
    expect(
      pgliteResetCliBlockedReason({
        APROOF_DB_MODE: "pglite",
        DATABASE_URL: "postgres://ignored",
      } as NodeJS.ProcessEnv)
    ).toBeNull();
  });

  it("allows default PGlite when mode and URL unset", () => {
    expect(pgliteResetCliBlockedReason({} as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("isLikelyPgliteStorageCorruptionError", () => {
  it("detects 58P01 in message", () => {
    expect(isLikelyPgliteStorageCorruptionError(new Error('58P01 could not open file "base/5/6104"'))).toBe(true);
  });

  it("detects ENOENT", () => {
    const e = new Error("ENOENT") as NodeJS.ErrnoException;
    e.code = "ENOENT";
    expect(isLikelyPgliteStorageCorruptionError(e)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isLikelyPgliteStorageCorruptionError(new Error("connection refused"))).toBe(false);
  });
});
