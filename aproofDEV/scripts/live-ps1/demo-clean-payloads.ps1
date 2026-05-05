# Baseline-complete payloads for live “clean control” POSTs (mirrors APROOF/src/demo/demo-clean-payloads.ts).

function Get-AproofCleanSystemPolicyPayload {
  @{
    record_id         = "live-ps1-system-record"
    host              = "live-ps1"
    name              = "ehr-suite"
    policy            = @{ tags = @("allow_read"); version = "v1" }
    system            = @{ rails = @("ehr", "queue", "llm", "audit") }
    identity_access   = @{
      actor_id            = "actor-demo-001"
      role                = "clinical_integrator"
      principal_id        = "actor-demo-001"
      granted_scopes      = @("read:proofs")
      scopes              = @("read:proofs")
      tenant_id           = "tenant_demo"
      access_log_present  = $true
      token_valid         = $true
      token_expired       = $false
    }
    operational       = @{ execution_status = "success"; latency_ms = 120; runtime_error = $null }
    model_identity    = @{ observed_model = "gpt-4.1-mini" }
    retrieval         = @{ retrieved_sources = @("db", "cache") }
    deterministic     = @{ observed_digest = "stable-demo-digest-v1"; temperature = 0 }
    workflow          = @{ stage = "commit" }
    cross_system      = @{ observed_systems = @("ehr", "queue", "llm") }
    sync_id           = "sync-demo-001"
    correlation_id    = "corr-system-demo"
  }
}

function Get-AproofCleanServicePolicyPayload {
  @{
    record_id      = "live-ps1-service-record"
    host           = "live-ps1"
    policy         = @{ tags = @("allow_read"); rules = @("pii_scan", "audit_log") }
    service_id     = "svc-demo-001"
    identity_access = @{ api_key = "ak_live_demo_masked" }
    operational    = @{ execution_status = "success"; latency_ms = 95 }
    model_identity = @{ observed_model = "gpt-4.1-mini" }
    retrieval      = @{
      declared_dependencies = @("postgres", "redis")
      external_lookup       = @("vendor-api")
    }
    deterministic  = @{ observed_digest = "svc-stable-digest-v1" }
    operation_type = "read"
    request_id     = "req-demo-001"
    dependency_id  = "dep-queue-001"
    correlation_id = "corr-svc-demo"
  }
}

function Get-AproofCleanModelPolicyPayload {
  @{
    record_id       = "live-ps1-model-record"
    host            = "live-ps1"
    policy          = @{ tags = @("allow_read"); version = "v1" }
    model_id        = "model-demo-001"
    provider        = "demo-provider"
    org_id          = "org-demo"
    operational     = @{ latency_ms = 52; execution_status = "success" }
    model_identity  = @{ observed_model = "reader-v2"; version = "2.1" }
    retrieval       = @{ declared = $true; tool_usage = @("vector", "search") }
    deterministic   = @{ observed_digest = "model-digest-v1"; temperature = 0 }
    correlation_id  = "corr-model-demo"
  }
}

function Get-AproofCleanAgentPolicyPayload {
  @{
    record_id      = "live-ps1-agent-record"
    host           = "live-ps1"
    policy         = @{ tags = @("allow_read") }
    agent_id       = "agent-demo-001"
    identity_access = @{ scopes = @("read:proofs", "tool:search") }
    agent          = @{
      allowed_actions  = @("read", "search")
      step_trace       = @("plan", "act", "verify")
      execution_state  = "completed"
      decision_trace   = @("branch-a")
    }
    model_identity = @{ observed_model = "gpt-4.1-mini" }
    retrieval      = @{ tool_usage = @("web"); external_lookup = @("kb-1") }
    deterministic  = @{ observed_digest = "agent-digest-v1" }
    tool_invocation_id   = "tool-inv-001"
    external_response_id = "ext-resp-001"
    correlation_id = "corr-agent-demo"
  }
}

function Get-AproofCleanEndpointPolicyPayload {
  @{
    record_id      = "live-ps1-endpoint-record"
    host           = "live-ps1"
    route          = "/v1/chat"
    policy         = @{ tags = @("allow_read") }
    endpoint       = @{
      restrictions       = @("no_pii_export")
      connectivity_state = "online"
    }
    endpoint_id    = "ep-demo-001"
    identity_access = @{
      actor_id       = "user-demo-001"
      role           = "operator"
      principal_id   = "user-demo-001"
      granted_scopes = @("read:proofs")
      tenant_id      = "tenant_demo"
      token_valid    = $true
      token_expired  = $false
      access_log_present = $true
    }
    operational    = @{ execution_status = "success"; latency_ms = 42 }
    model_identity = @{ observed_model = "gpt-4.1-mini"; version = "1.0" }
    retrieval      = @{ local_source = "cache"; remote_source = "api" }
    deterministic  = @{ observed_digest = "ep-digest-v1" }
    request_type   = "chat"
    sync_id        = "sync-ep-001"
    upload_id      = "upl-001"
    callback_id    = "cb-001"
    correlation_id = "corr-ep-demo"
  }
}
