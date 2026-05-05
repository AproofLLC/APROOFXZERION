/** Aligned with APROOF HTTP contracts (internal view). */

export type PageMeta = {
  limit: number;
  offset: number;
  total: number;
};

export type Session = {
  user_id: string;
  organization_id: string;
  environment_id: string;
  environment: string;
  environment_mode: "testnet" | "staging" | "production";
  has_subject: boolean;
  subject_id: string | null;
  expires_at: string;
};

export type Subject = {
  subject_id: string;
  subject_type: string;
  organization_id: string;
  environment_id: string;
  environment: string;
  display_name?: string | null;
  external_key: string | null;
  created_at: string;
  latest_event_timestamp: string | null;
  latest_proof_timestamp: string | null;
  latest_anchor_timestamp: string | null;
};

export type SubjectOverview = {
  subject_header: Subject;
  metadata: Record<string, unknown>;
  event_count?: number;
  proof_event_count?: number;
  angle_result_count?: number;
  baseline_count?: number;
  active_angle_count?: number;
  failure_count?: number;
  anchor_status?: string;
  latest_proof?: string | null;
  latest_proof_status?: string | null;
  baselines_summary?: Array<{ angle: string; enabled: boolean }>;
  status_strip: {
    total_events: number;
    total_proofs: number;
    active_failures: number;
    lineage_count: number;
    latest_anchor_batch_id: string | null;
    baseline_coverage: number;
    latest_anchor_metadata?: Record<string, unknown>;
  };
  latest_proof_snapshot: {
    proof_id: string | null;
    status: string | null;
    flags: number;
    delta_detected: boolean;
    anchor_status: string | null;
  };
  angles_summary: Array<{ angle: string; status: string; reason_code: string }>;
  recent_events: Array<{
    event_id: string;
    event_type: string;
    occurred_at: string;
    source_type_key: string;
    proofability: string;
  }>;
  active_failures_list: Array<{
    failure_id: string;
    angle: string;
    reason_code: string;
    step: string;
    created_at: string;
  }>;
  pipeline_state: {
    raw_ingested: boolean;
    canonicalized: boolean;
    identity_resolved: boolean;
    baseline_resolved: boolean;
    angles_evaluated: boolean;
    proof_built: boolean;
    anchorable: boolean;
  };
};

export type ProofListSummary = {
  proof_id: string;
  event_id: string;
  event_lineage_id: string;
  event_version: number;
  event_type: string;
  event_timestamp: string;
  proof_status: string;
  proof_sufficiency: string;
  flags_count: number;
  highest_severity: string | null;
  contract_valid: boolean;
  anchor_status: string;
  created_at: string;
  failure_locator_summary: { angle: string; step: string; reason_code: string } | null;
  failed_angles: string[];
  primary_failure_category: string | null;
};

/** Single angle row inside `product_proof.angles` (internal view). */
export type ProductAngleResult = {
  angle: string;
  applicable: boolean;
  status: string;
  reason_code: string;
  summary: string;
  evidence_refs: string[];
  baseline_present?: boolean;
  baseline_status?: string;
  baseline_source?: string;
  baseline_version?: string;
  baseline_summary?: string | null;
  expected_summary?: string | null;
  actual_summary?: string | null;
  compared_fields?: string[];
  changed_fields?: string[];
  sources_state?: string;
  metadata?: Record<string, unknown>;
};

export type ProductProof = {
  proof_id: string;
  subject_id: string;
  subject_type: string;
  event_id?: string;
  event_lineage_id?: string;
  event_version?: number;
  artifact_id?: string;
  canonical_event_id?: string;
  raw_event_id?: string;
  event_type: string;
  event_timestamp: string;
  proof_status: string;
  proof_summary: string;
  angles: ProductAngleResult[];
  contract_valid: boolean;
  flags_count: number;
  anchor_status: string;
  anchor_batch_id?: string | null;
  anchor_chain?: string | null;
  anchor_payload?: string | null;
  anchor_tx_hash?: string | null;
  anchor_explorer_url?: string | null;
  anchor_wallet_public_key?: string | null;
  anchor_confirmation_status?: string | null;
  anchor_error_message?: string | null;
  anchor_root_hash?: string | null;
  anchor_proof_count?: number | null;
  anchor_proof_ids?: string[] | null;
  anchor_timestamp?: string | null;
  solana_sandbox?: {
    route: "solana-sandbox";
    chain_family: "solana";
    cluster: string;
    batch_hash: string;
    anchor_payload: string | null;
    simulated_signature: string;
    simulated_slot: string;
    simulated_commitment: string;
    external_attested: false;
  } | null;
  created_at: string;
  updated_at?: string;
  verifier_version?: string;
  proof_digest?: string;
  failure_locator?: Record<string, unknown> | null;
};

/** Full GET /proofs/:id envelope (internal). */
export type ProofDetailEnvelope = Record<string, unknown> & {
  product_proof?: ProductProof;
  proof_list_summary?: ProofListSummary;
  failure_intelligence?: Record<string, unknown>;
  failure_rollup?: Record<string, unknown>;
  evidence_refs?: string[];
  linked_events?: Array<{ event_id: string; relationship: string }>;
  anchor_metadata?: {
    anchor_id?: string | null;
    batch_id?: string | null;
    root_hash?: string | null;
    proof_count?: number | null;
    proof_ids?: string[];
    network?: string | null;
    cluster?: string | null;
    anchor_mode?: string | null;
    tx_signature?: string | null;
    explorer_url?: string | null;
    wallet_public_key?: string | null;
    status?: "pending" | "confirmed" | "failed" | "mocked" | "disabled";
    confirmation_status?: string | null;
    anchored_at?: string | null;
    created_at?: string;
    error_message?: string | null;
  } & Record<string, unknown>;
  metadata?: Record<string, unknown>;
  identity?: Record<string, unknown>;
};

export type ProofListItem = ProofDetailEnvelope;

export type ProofVerification = {
  proof_id: string;
  subject_id: string | null;
  event_id: string | null;
  batch_id: string | null;
  verification_status: "valid" | "invalid" | "not_anchored" | "error";
  computed_root_hash: string | null;
  anchored_root_hash: string | null;
  proof_digest: string | null;
  tx_signature: string | null;
  explorer_url: string | null;
  network: string | null;
  anchor_status: string | null;
  verified_at: string;
  mismatch_reason: string | null;
  error_message: string | null;
};

export type ProofVerificationResponse = ProofVerification;

export type EventListItem = {
  event_id: string;
  raw_event_id: string;
  artifact_id: string;
  event_lineage_id: string;
  lineage_id: string;
  version: number;
  source_type: string;
  ingestion_source?: string | null;
  canonical_event_type: string;
  timestamp: string;
  occurred_at: string;
  canonical_hash?: string;
  occurrence_hash?: string | null;
  idempotency_key?: string | null;
  proof_id: string | null;
  linked_proof_refs?: { proof_id: string | null }[];
  related_failure_refs?: Array<{ failure_id: string; angle: string; reason_code: string }>;
};

export type EventDetail = {
  event_id: string;
  subject_id: string;
  occurred_at: string;
  artifact_id: string;
  source_type: string;
  lineage_id: string;
  canonical_event_type: string;
  linked_proof_refs: { proof_id: string | null }[];
  related_failure_refs: Array<{ failure_id: string; angle: string; reason_code: string }>;
  raw_payload: unknown;
  canonical_form: unknown;
  canonicalized_representation?: unknown;
  identity_resolution: Record<string, unknown>;
  lineage_assignment: Record<string, unknown>;
  state_hashes: Record<string, unknown>;
  linked_proof?: Record<string, unknown>;
  pipeline_metadata: unknown;
  metadata: Record<string, unknown>;
};

export type FailureListItem = {
  failure_id: string;
  angle: string;
  reason_code: string;
  step: string;
  failure_priority: string;
  severity: string;
  event_id: string;
  proof_id: string;
  created_at: string;
};

export type FailureDetail = {
  failure_id: string;
  proof_id: string;
  subject_id: string | null;
  created_at: string;
  angle: string;
  severity: string;
  reason_code: string;
  expected_baseline: unknown;
  actual_observed: unknown;
  failed_field_condition?: {
    inspection_path: string | null;
    missing_fields: string[];
  };
  related_event_refs?: Array<{ event_id: string; relationship: string }>;
  related_proof_refs?: Array<{ proof_id: string }>;
  metadata?: Record<string, unknown>;
  failure_overview?: Record<string, unknown>;
} & Record<string, unknown>;

export type LineageListItem = {
  lineage_id: string;
  artifact_id: string | null;
  artifact_summary: string | null;
  version_count: number;
  first_seen: string | null;
  last_updated: string | null;
};

export type LineageVersionEntry = {
  event_id: string;
  version: number;
  timestamp: string;
  canonical_hash: string;
  proof_id: string | null;
};

export type LineageDetail = {
  lineage_id: string;
  artifact_id: string | null;
  artifact_identity?: {
    artifact_id: string | null;
    stable_identity_summary: string | null;
    metadata: Record<string, unknown>;
  };
  version_timeline?: LineageVersionEntry[];
  ordered_event_sequence?: LineageVersionEntry[];
  related_proofs?: string[];
  version_progression?: Array<{
    from_version: number;
    to_version: number;
    changed_fields: string[];
    delta_summary: string | null;
  }>;
  delta_inspector?: Array<{
    from_version: number;
    to_version: number;
    changed_fields: string[];
    delta_summary: string | null;
  }>;
  anchor_linkage?: Array<{
    version: number;
    anchored: boolean;
    anchor_batch_id: string | null;
  }>;
  anchor_mapping?: Array<{
    version: number;
    anchored: boolean;
    anchor_batch_id: string | null;
    root_hash?: string | null;
    network?: string | null;
    tx_signature?: string | null;
    explorer_url?: string | null;
    wallet_public_key?: string | null;
    status?: string;
    confirmation_status?: string | null;
    anchored_at?: string | null;
  }>;
  metadata?: Record<string, unknown>;
} & Record<string, unknown>;

export type AngleSummary = {
  angle: string;
  /** Governance (definition.angle_control) — same in sandbox and production. */
  enabled: boolean;
  required: boolean;
  default_origin: "auto" | "user";
  config: Record<string, unknown>;
  baseline_present: boolean;
  baseline_summary: string;
  last_updated: string | null;
  baseline_version: number;
  baseline_locked: boolean;
  evidence_sufficiency: "full" | "qualified" | "insufficient";
  sources_state: "present" | "no sources";
  metadata: Record<string, unknown>;
};

export type AngleDetail = {
  angle: string;
  baseline_present: boolean;
  evidence_sufficiency: string;
  sources_state: "present" | "no sources";
  definition: unknown;
  baseline_rules: unknown[];
  current_values: unknown;
  editable_fields: string[];
  recent_violations: Array<{ failure_id: string; reason_code: string; created_at: string }>;
  baseline_version: number;
  baseline_locked: boolean;
  version_history: Array<{
    version: number;
    effective_from: string;
    effective_to: string | null;
    baseline_summary: string;
  }>;
  metadata: Record<string, unknown>;
};

export type AccountSettings = {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
};

export type OrganizationSettings = {
  organization_id: string;
  name: string;
  created_at: string;
};

export type OrgUserRow = {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
};

export type EnvironmentSettings = {
  environment_id: string;
  name: string;
  mode: "testnet" | "staging" | "production";
  created_at: string;
};

export type ApiKeyListItem = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  revoked: boolean;
};

/** Subject user activity logs (ingested; not canonical events / not proof outputs). */
export type SubjectUserLog = {
  user_log_id: string;
  subject_id: string;
  organization_id: string;
  environment_id: string;
  occurred_at: string;
  action_type: string;
  action_title: string;
  summary: string | null;
  source: string | null;
  actor_id: string | null;
  actor_type: string | null;
  trace_id: string | null;
  related_event_id: string | null;
  related_proof_id: string | null;
  related_lineage_id: string | null;
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown> | null;
};

export type SubjectUserLogSummary = {
  total_logs: number;
  latest_activity: {
    action_title: string | null;
    occurred_at: string | null;
    source: string | null;
  };
  distinct_sources: string[];
};

export type SubjectUserLogsResponse = {
  subject_id: string;
  environment: "production" | "testnet" | "sandbox" | string;
  logs: SubjectUserLog[];
  pagination?: {
    limit: number;
    offset: number;
    next_cursor: string | null;
  };
  empty_reason?: string | null;
  /** Legacy compatibility */
  items?: SubjectUserLog[];
  /** Legacy compatibility */
  next_cursor?: string;
};
