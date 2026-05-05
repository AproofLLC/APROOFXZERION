/**
 * MVP identity_access_integrity evaluator contract (baseline.definition):
 * {
 *   "type": "identity_access_integrity_v1",
 *   "required_scopes": string[],
 *   "expected_tenant_id"?: string | null,
 *   "require_access_log"?: boolean
 * }
 *
 * Observed payload shape:
 * payload.identity_access = {
 *   principal_id: string,
 *   principal_type?: "user" | "service" | "api_key" | "system",
 *   granted_scopes?: string[],
 *   tenant_id?: string | null,
 *   token_valid?: boolean,
 *   token_expired?: boolean,
 *   access_log_present?: boolean
 * }
 */

export type IdentityAccessEvaluationResult =
  | {
      status: "conformant";
      deltaCode: null;
      expectedJson: Record<string, unknown>;
      observedJson: Record<string, unknown>;
      evidenceJson: Record<string, unknown>;
    }
  | {
      status: "violated";
      deltaCode:
        | "IDENTITY_ACCESS_PRINCIPAL_MISSING"
        | "IDENTITY_ACCESS_TOKEN_INVALID"
        | "IDENTITY_ACCESS_SCOPES_MISSING"
        | "IDENTITY_ACCESS_TENANT_MISMATCH"
        | "IDENTITY_ACCESS_LOG_MISSING";
      expectedJson: Record<string, unknown>;
      observedJson: Record<string, unknown>;
      evidenceJson: Record<string, unknown>;
    }
  | {
      status: "unverifiable";
      deltaCode:
        | "IDENTITY_ACCESS_BASELINE_SHAPE"
        | "IDENTITY_ACCESS_BASELINE_TYPE"
        | "IDENTITY_ACCESS_OBSERVED_SHAPE";
      expectedJson: Record<string, unknown> | null;
      observedJson: Record<string, unknown> | null;
      evidenceJson: Record<string, unknown>;
    };

export function evaluateIdentityAccessIntegrityMvp(
  baselineDefinition: unknown,
  canonicalPayload: Record<string, unknown>
): IdentityAccessEvaluationResult {
  if (baselineDefinition === null || typeof baselineDefinition !== "object") {
    return {
      status: "unverifiable",
      deltaCode: "IDENTITY_ACCESS_BASELINE_SHAPE",
      expectedJson: null,
      observedJson: null,
      evidenceJson: { detail: "baseline.definition_not_object" },
    };
  }

  const def = baselineDefinition as Record<string, unknown>;

  if (def.type !== "identity_access_integrity_v1") {
    return {
      status: "unverifiable",
      deltaCode: "IDENTITY_ACCESS_BASELINE_TYPE",
      expectedJson: def,
      observedJson: null,
      evidenceJson: { detail: "expected_type_identity_access_integrity_v1" },
    };
  }

  const requiredScopesRaw = def.required_scopes;
  if (!Array.isArray(requiredScopesRaw) || !requiredScopesRaw.every((s) => typeof s === "string")) {
    return {
      status: "unverifiable",
      deltaCode: "IDENTITY_ACCESS_BASELINE_SHAPE",
      expectedJson: def,
      observedJson: null,
      evidenceJson: { detail: "required_scopes_not_string_array" },
    };
  }

  const requiredScopes = requiredScopesRaw as string[];
  const expectedTenantId =
    typeof def.expected_tenant_id === "string" ? def.expected_tenant_id : null;
  const requireAccessLog = def.require_access_log === true;

  const observed = canonicalPayload.identity_access;
  if (observed === null || typeof observed !== "object") {
    return {
      status: "unverifiable",
      deltaCode: "IDENTITY_ACCESS_OBSERVED_SHAPE",
      expectedJson: {
        required_scopes: requiredScopes,
        expected_tenant_id: expectedTenantId,
        require_access_log: requireAccessLog,
      },
      observedJson: null,
      evidenceJson: { detail: "payload.identity_access_missing" },
    };
  }

  const ia = observed as Record<string, unknown>;

  const principalId = ia.principal_id;
  const grantedScopes = ia.granted_scopes;
  const tenantId = ia.tenant_id;
  const tokenValid = ia.token_valid;
  const tokenExpired = ia.token_expired;
  const accessLogPresent = ia.access_log_present;

  if (typeof principalId !== "string" || !principalId.trim()) {
    return {
      status: "violated",
      deltaCode: "IDENTITY_ACCESS_PRINCIPAL_MISSING",
      expectedJson: {
        principal_id: "non-empty string",
        required_scopes: requiredScopes,
      },
      observedJson: ia,
      evidenceJson: { detail: "principal_id_missing_or_empty" },
    };
  }

  if (tokenValid === false || tokenExpired === true) {
    return {
      status: "violated",
      deltaCode: "IDENTITY_ACCESS_TOKEN_INVALID",
      expectedJson: {
        token_valid: true,
        token_expired: false,
      },
      observedJson: ia,
      evidenceJson: { detail: "token_invalid_or_expired" },
    };
  }

  if (!Array.isArray(grantedScopes) || !grantedScopes.every((s) => typeof s === "string")) {
    return {
      status: "unverifiable",
      deltaCode: "IDENTITY_ACCESS_OBSERVED_SHAPE",
      expectedJson: {
        granted_scopes: "string[]",
        required_scopes: requiredScopes,
      },
      observedJson: ia,
      evidenceJson: { detail: "granted_scopes_not_string_array" },
    };
  }

  const grantedSet = new Set(grantedScopes as string[]);
  const missingScopes = requiredScopes.filter((s) => !grantedSet.has(s));
  if (missingScopes.length > 0) {
    return {
      status: "violated",
      deltaCode: "IDENTITY_ACCESS_SCOPES_MISSING",
      expectedJson: {
        required_scopes: requiredScopes,
      },
      observedJson: {
        granted_scopes: grantedScopes,
      },
      evidenceJson: { missing_scopes: missingScopes },
    };
  }

  if (expectedTenantId !== null && tenantId !== expectedTenantId) {
    return {
      status: "violated",
      deltaCode: "IDENTITY_ACCESS_TENANT_MISMATCH",
      expectedJson: {
        expected_tenant_id: expectedTenantId,
      },
      observedJson: {
        tenant_id: tenantId ?? null,
      },
      evidenceJson: { detail: "tenant_id_mismatch" },
    };
  }

  if (requireAccessLog && accessLogPresent !== true) {
    return {
      status: "violated",
      deltaCode: "IDENTITY_ACCESS_LOG_MISSING",
      expectedJson: {
        require_access_log: true,
        access_log_present: true,
      },
      observedJson: {
        access_log_present: accessLogPresent ?? null,
      },
      evidenceJson: { detail: "access_log_required_but_missing" },
    };
  }

  return {
    status: "conformant",
    deltaCode: null,
    expectedJson: {
      required_scopes: requiredScopes,
      expected_tenant_id: expectedTenantId,
      require_access_log: requireAccessLog,
    },
    observedJson: {
      principal_id: principalId,
      granted_scopes: grantedScopes,
      tenant_id: tenantId ?? null,
      token_valid: tokenValid ?? null,
      token_expired: tokenExpired ?? null,
      access_log_present: accessLogPresent ?? null,
    },
    evidenceJson: { matched: true },
  };
}
