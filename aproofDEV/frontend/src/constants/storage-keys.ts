/** SessionStorage keys shared across /proofs onboarding and proof list selection. */
export const SESSION_PENDING_PROOF_ID_KEY = "aproof_pending_proof_id";
export const SESSION_LAST_INGEST_RESULT_KEY = "aproof_last_ingest_result";
/** Last sandbox scenario used (for badge + replay); cleared on sign-out. */
export const SESSION_SANDBOX_TEMPLATE_KEY = "aproof_sandbox_template";
/** Last bootstrap primary subject id (demo focus); cleared on sign-out. */
export const SESSION_SANDBOX_PRIMARY_SUBJECT_KEY = "aproof_sandbox_primary_subject";
/** Map of rail → subject_id from multi-subject demo bootstrap; cleared on sign-out. */
export const SESSION_SANDBOX_SUBJECT_MAP_KEY = "aproof_sandbox_subject_ids_by_rail";
