# Verify Proof

Aproof does not store full proof payloads on-chain. Solana Devnet stores a `root_hash` commitment for each anchored batch.

The Verify Proof pathway is a read-time integrity check:

1. Read stored proof unit + batch membership.
2. Recompute proof digest from canonical proof material (`proof_id`, `angle`, `status`, `delta_code`) using the existing hashing utility.
3. Recompute batch `root_hash` from ordered proof digests using the same batch hash utility used by anchoring.
4. Compare recomputed `root_hash` to the anchored/stored batch `root_hash`.

Verification outcomes:

- `valid`: recomputed `root_hash` matches anchored commitment.
- `invalid`: recomputed `root_hash` does not match anchored commitment.
- `not_anchored`: no anchor/batch/root metadata exists for the proof.
- `error`: deterministic recomputation failure (safe non-secret error code).

This endpoint verifies integrity consistency against the committed anchor value; it does not generate new proofs and does not alter proof creation or anchoring behavior.

## UI placement (current)

In the frontend proof detail view (`/app/proofs` -> select proof), verification is fetched automatically on proof selection using `GET /proofs/:proofId/verification`.

Verification is displayed at the end of **A. Summary** (below `anchor_status`) with:

- `Verification`
- `status` (`loading`, `valid`, `invalid`, `not_anchored`, `error`)
- outcome line (`Verified against anchored root`, `Mismatch with anchored root`, `No anchor found`, `Verification error`)
- optional `View Anchor ->` link when `explorer_url` is present
