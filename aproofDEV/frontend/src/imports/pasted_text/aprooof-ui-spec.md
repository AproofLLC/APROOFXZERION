Design a modern, minimal, enterprise-grade SaaS web application UI called “Aproof”.

STYLE DIRECTION

- Dark mode only
- Background: near-black (#0b0b0c)
- Text: white and soft gray hierarchy
- Accent: subtle white / light gray (no neon, no bright colors)
- Clean, quiet, high-trust design (similar to Stripe, Vercel, Linear, Checkr)
- Rounded corners (lg to 2xl)
- Soft borders (white/10)
- No clutter, no unnecessary icons
- Typography: Inter or similar (tight, clean spacing)
- Layout: centered content, max-width containers, strong vertical rhythm

OVERALL STRUCTURE

Global top navigation (persistent across all pages):

Left:
- Aproof logo (simple wordmark)

Right:
- Home
- Sales
- Proofs
- Regulatory
- Contact

No sidebar outside of the product (Proofs section).

---

# 1. HOME PAGE (/)

PURPOSE:
Explain what Aproof is. No product interaction.

LAYOUT:

SECTION 1 — HERO
- Large title:
  “Immutable Integrity for AI and Software Systems”
- Subtext:
  “Aproof captures, evaluates, and anchors system behavior into verifiable proof.”
- Centered layout
- Subtle diagram/visual:
  Input → Canonical → Evaluate → Proof → Anchor

SECTION 2 — WHAT APROOF DOES
- 3–4 cards:
  - Capture system events
  - Normalize into canonical form
  - Evaluate across integrity angles
  - Produce immutable proof

SECTION 3 — SUBJECT TYPES
Grid of cards:
- LLMs
- Agents
- Services
- Systems
- Endpoints

SECTION 4 — 7 ANGLES
Grid layout:
- Deterministic Integrity
- Model Identity Integrity
- Retrieval Integrity
- Policy Integrity
- Operational Integrity
- Identity & Access Integrity
- Cross-System Integrity

Each:
- Title
- 1-line description

SECTION 5 — OUTPUT
Simple structured card showing:
- Event
- Lineage
- Proof
- Anchor

SECTION 6 — CLOSING
Minimal line:
“Truth, preserved. Not interpreted.”

---

# 2. SALES PAGE (/sales)

PURPOSE:
Pricing and entry.

LAYOUT:

SECTION 1 — HERO PRICING
Centered:

- “Simple Pricing”
- Large:
  $0.05
- “per anchor”
- Subtext:
  “Immutable, finalized proof recorded on-chain”

Bullet list:
- Deterministic proof generation
- Full event traceability
- Lineage tracking
- Failure detection
- Immutable anchor record

CTA:
[ Start Anchoring ]

---

SECTION 2 — FREE PROOFS STRIP
Full width band:

- “50 Free Proofs Included”
- “No commitment. Start immediately.”

---

SECTION 3 — BILLING
- “Usage-Based Billing”
- Pay only for what you use
- No subscriptions
- Credits loaded upfront

---

SECTION 4 — HIGH VOLUME
- “High-Volume Usage”
- Custom pricing for 100,000+ anchors/month

---

SECTION 5 — FINAL CTA
[ Start Anchoring ]
“Get started in minutes”

---

# 3. PROOFS (PRODUCT APP) (/proofs)

PURPOSE:
Main system interface.

When user enters:
- If not authenticated → Access Gateway
- If authenticated → Product Shell

---

## 3A. ACCESS GATEWAY

Tabs:
- Sign In
- Sign Up
- Testnet

### SIGN IN
Inputs:
- user_id
- password

Button:
[ Sign In ]

---

### SIGN UP
Inputs:
- organization
- role
- email
- username
- password

Button:
[ Create Account ]

---

### TESTNET
Button:
[ Enter Testnet ]

Subtext:
“Launch a sandbox subject with no production impact”

---

## 3B. PRODUCT SHELL

Layout:

Left sidebar (ONLY inside product):
- Overview
- Events
- Traceability
- Proofs
- Failures
- Angles & Baselines
- Settings

Top bar:
- Subject ID
- Environment
- Org
- Minimal status

---

# 3C. OVERVIEW TAB

SECTION: Subject Header
- subject_id
- subject_type
- environment
- last event / proof / anchor timestamps

SECTION: Status Strip
- total events
- total proofs
- active failures
- baseline coverage (7/7)

SECTION: Latest Proof
Card:
- proof_id
- status
- flags
- anchor status

SECTION: 7 ANGLES
Grid:
Each shows:
- status
- reason_code

SECTION: Recent Events
Table (last N events)

SECTION: Active Failures
List

SECTION: Pipeline Visualization
Horizontal:
Event → Canonical → Identity → Lineage → Baseline → Angles → Proof → Anchor

---

# 3D. EVENTS TAB

TABLE:
- event_id
- artifact_id
- lineage_id
- version
- source_type
- timestamp

---

EVENT DETAIL:

1. Raw Payload
2. Canonical Form
3. Identity Resolution
   - identity_source
   - confidence
4. Lineage Assignment
5. State Hashes
6. Linked Proof
7. Pipeline Metadata

---

# 3E. TRACEABILITY TAB

TABLE:
- lineage_id
- artifact_id
- version count
- first_seen
- last_updated

---

LINEAGE DETAIL:

- Artifact identity
- Version timeline (v1 → v2 → v3)
- Delta inspector (changes)
- Anchor mapping

---

# 3F. PROOFS TAB

TABLE:
- proof_id
- status
- flags
- anchor status
- timestamp

---

PROOF DETAIL:

1. Overview
2. 7 Angles
   - status
   - reason_code
   - evidence_refs
3. Baseline vs Actual
4. Evidence References
5. Failure Summary
6. Anchor Metadata
7. Linked Event

---

# 3G. FAILURE LOCATOR

TABLE:
- failure_id
- angle
- severity
- event_id

---

DETAIL:
- failure overview
- impacted artifact
- evidence
- full trace chain

---

# 3H. ANGLES & BASELINES

TABLE:
- angle
- baseline summary
- last updated

---

DETAIL:
- definition
- baseline rules
- current values
- versions
- violations

---

# 3I. SETTINGS

Sections:
- API (keys)
- Account (email/password)
- Organization (users)
- Environment (mode: testnet/staging/prod)
- Subject (id/type)

---

# 4. REGULATORY PAGE (/regulatory)

PURPOSE:
Explain compliance alignment.

LAYOUT:

- Hero:
  “Built for auditability, not assumptions”
- Sections:
  - Traceability
  - Provenance
  - Lineage
  - Immutable Anchoring
- Statement:
  “Aproof provides verifiable system records. It does not certify compliance.”

---

# 5. CONTACT PAGE (/contact)

Minimal:

- Title:
  “Contact Us”
- Subtext:
  “Direct communication only”
- Card:
  aproofllc@outlook.com

---

# DESIGN RULES

- No clutter
- No unnecessary color
- Everything readable in 2–3 seconds
- Tables are clean and spaced
- Cards are subtle
- No animation overload
- Focus on clarity, not decoration

---

# OUTPUT REQUIREMENT

Generate:

- Full desktop web UI
- All pages listed above
- Consistent spacing system
- Clean reusable components
- Tables, cards, headers, and navigation
- Minimal but precise visual hierarchy