# Disclosure modes (`x-proof-view`)

The same underlying proof can be **surfaced differently** depending on who should see it. All HTTP endpoints that return proof-shaped JSON honor the optional header:

```http
x-proof-view: internal | external | minimal | adversarial_safe
```

If omitted or invalid, the default is **`internal`**.

## Why this exists

- **Operators** need full detail to debug (evidence paths, failure locators, rich insights).  
- **External** consumers need honest proof outcomes **without** leaking internal inspection paths or raw diagnostic blobs.  
- **Minimal / adversarial_safe** reduce the attack surface and narrative leakage when proofs are shown in untrusted or high-risk contexts (e.g. user-visible UI, hostile prompts).

## Modes at a glance

| Mode | Typical use | What you get |
|------|-------------|--------------|
| **internal** | Engineering, SRE, forensics | Full `proof_units`, full `product_proof`, full `failure_intelligence`, **`identity`** block on ingest/read envelopes. |
| **external** | Partners, shared dashboards | Redacted proof units (no raw evidence/inspection paths), trimmed failure locator and insights; **`identity` is still included** (ids + hashes are not treated as internal-only diagnostics). |
| **minimal** | Customer-facing status | `ok`, `canonical_event_type`, and compact `product_proof` (proof status + per-angle angle/applicable/status only). No `identity`, `proof_units`, or `failure_intelligence`. |
| **adversarial_safe** | Untrusted viewers / LLM-facing surfaces | Same minimal proof strip as **minimal**, plus a neutral message: `Integrity verification completed.` |

## List endpoints

**`GET /failures`** applies the same view family:

- **internal** — Full failure locator rows (ids, paths, hosts, etc.).  
- **external** — Reduced fields per item (e.g. event, angle, host, time).  
- **minimal** / **adversarial_safe** — Further reduced rows; adversarial_safe adds the same neutral message.

Full field lists: [API-FREEZE.md](./API-FREEZE.md).
