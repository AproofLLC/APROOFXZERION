/// <reference path="../vitest-test-globals.d.ts" />
import { evaluateIdentityAccessIntegrityMvp } from "./identity-access-evaluator.js";

describe("evaluateIdentityAccessIntegrityMvp", () => {
  const baseline = {
    type: "identity_access_integrity_v1",
    required_scopes: ["read:proofs"],
    expected_tenant_id: "tenant_a",
    require_access_log: true,
  };

  it("conformant when identity access satisfies baseline", () => {
    const r = evaluateIdentityAccessIntegrityMvp(baseline, {
      identity_access: {
        principal_id: "user_123",
        granted_scopes: ["read:proofs", "write:proofs"],
        tenant_id: "tenant_a",
        token_valid: true,
        token_expired: false,
        access_log_present: true,
      },
    });

    expect(r.status).toBe("conformant");
    expect(r.deltaCode).toBeNull();
  });

  it("violated when principal is missing", () => {
    const r = evaluateIdentityAccessIntegrityMvp(baseline, {
      identity_access: {
        granted_scopes: ["read:proofs"],
        tenant_id: "tenant_a",
        token_valid: true,
        token_expired: false,
        access_log_present: true,
      },
    });

    expect(r.status).toBe("violated");
    expect(r.deltaCode).toBe("IDENTITY_ACCESS_PRINCIPAL_MISSING");
  });

  it("violated when token is expired", () => {
    const r = evaluateIdentityAccessIntegrityMvp(baseline, {
      identity_access: {
        principal_id: "user_123",
        granted_scopes: ["read:proofs"],
        tenant_id: "tenant_a",
        token_valid: true,
        token_expired: true,
        access_log_present: true,
      },
    });

    expect(r.status).toBe("violated");
    expect(r.deltaCode).toBe("IDENTITY_ACCESS_TOKEN_INVALID");
  });

  it("violated when required scope is missing", () => {
    const r = evaluateIdentityAccessIntegrityMvp(baseline, {
      identity_access: {
        principal_id: "user_123",
        granted_scopes: ["write:proofs"],
        tenant_id: "tenant_a",
        token_valid: true,
        token_expired: false,
        access_log_present: true,
      },
    });

    expect(r.status).toBe("violated");
    expect(r.deltaCode).toBe("IDENTITY_ACCESS_SCOPES_MISSING");
  });

  it("violated when tenant mismatches", () => {
    const r = evaluateIdentityAccessIntegrityMvp(baseline, {
      identity_access: {
        principal_id: "user_123",
        granted_scopes: ["read:proofs"],
        tenant_id: "tenant_b",
        token_valid: true,
        token_expired: false,
        access_log_present: true,
      },
    });

    expect(r.status).toBe("violated");
    expect(r.deltaCode).toBe("IDENTITY_ACCESS_TENANT_MISMATCH");
  });

  it("violated when access log is required but missing", () => {
    const r = evaluateIdentityAccessIntegrityMvp(baseline, {
      identity_access: {
        principal_id: "user_123",
        granted_scopes: ["read:proofs"],
        tenant_id: "tenant_a",
        token_valid: true,
        token_expired: false,
        access_log_present: false,
      },
    });

    expect(r.status).toBe("violated");
    expect(r.deltaCode).toBe("IDENTITY_ACCESS_LOG_MISSING");
  });

  it("unverifiable when baseline type is wrong", () => {
    const r = evaluateIdentityAccessIntegrityMvp(
      { type: "other" },
      {
        identity_access: {
          principal_id: "user_123",
          granted_scopes: ["read:proofs"],
        },
      }
    );

    expect(r.status).toBe("unverifiable");
    expect(r.deltaCode).toBe("IDENTITY_ACCESS_BASELINE_TYPE");
  });
});
