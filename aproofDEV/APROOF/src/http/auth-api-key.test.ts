import { describe, it, expect } from "vitest";
import {
  hashApiKeyForStorage,
  legacySha256Hash,
  verifyApiKeySecret,
} from "./auth-api-key.js";

describe("auth-api-key hardening", () => {
  it("scrypt-based key verifies correctly", () => {
    const secret = "ak_live_test_secret_key_12345";
    const stored = hashApiKeyForStorage(secret);
    expect(stored.hashAlgo).toBe("scrypt");
    expect(stored.keySalt).toBeTruthy();
    expect(stored.keyPrefix).toBe("ak_live_");
    expect(verifyApiKeySecret(secret, stored)).toBe(true);
  });

  it("scrypt-based key rejects wrong secret", () => {
    const stored = hashApiKeyForStorage("correct_secret_abcde");
    expect(verifyApiKeySecret("wrong_secret_00000000", stored)).toBe(false);
  });

  it("legacy sha256 keys still verify during migration window", () => {
    const secret = "aproof_demo_insecure_change_me";
    const legacyHash = legacySha256Hash(secret);
    const row = { keyHash: legacyHash, hashAlgo: "sha256", keySalt: null };
    expect(verifyApiKeySecret(secret, row)).toBe(true);
  });

  it("legacy sha256 rejects wrong secret", () => {
    const legacyHash = legacySha256Hash("correct_secret");
    const row = { keyHash: legacyHash, hashAlgo: "sha256", keySalt: null };
    expect(verifyApiKeySecret("wrong_secret", row)).toBe(false);
  });

  it("prefix is 8 chars", () => {
    const stored = hashApiKeyForStorage("test1234rest_of_key");
    expect(stored.keyPrefix).toBe("test1234");
  });
});
