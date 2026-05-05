# Quick Verification Checklist

After extracting and setting up in Cursor, run these checks:

## ✅ Installation Check

```bash
# 1. Verify Node version (should be 18+)
node --version

# 2. Verify pnpm is available
pnpm --version

# 3. Install dependencies
pnpm install

# 4. Check if dev server starts
pnpm run dev
```

## ✅ File Structure Check

Verify these key files exist:

```bash
# Core files
✓ src/app/App.tsx
✓ src/app/routes.tsx
✓ src/app/components/Navigation.tsx
✓ src/app/components/Logo.tsx
✓ src/app/pages/Home.tsx
✓ src/app/pages/Proofs.tsx

# Product components
✓ src/app/components/proofs/ProofsOverview.tsx
✓ src/app/components/proofs/ProofsProofsList.tsx
✓ src/app/components/proofs/ProofsEvents.tsx
✓ src/app/components/proofs/ProofsTraceability.tsx
✓ src/app/components/proofs/ProofsFailures.tsx
✓ src/app/components/proofs/ProofsAngles.tsx
✓ src/app/components/proofs/ProofsSettings.tsx

# Assets
✓ src/imports/Untitled_design-1.png
✓ src/imports/subjects.png
✓ src/imports/7_angles.png

# Styles
✓ src/styles/theme.css
✓ src/styles/fonts.css
✓ src/styles/index.css

# Config
✓ package.json
✓ vite.config.ts
✓ postcss.config.mjs
```

## ✅ Functionality Check

Once the dev server is running, verify:

### Public Pages
- [ ] Navigate to `/` - Home page loads
- [ ] Navigate to `/sales` - Pricing page loads
- [ ] Navigate to `/regulatory` - Legal documents load
- [ ] Navigate to `/contact` - Contact page loads

### Navigation
- [ ] Logo in top-left is visible
- [ ] Navigation menu shows: Sales, Proofs, Regulatory, Contact
- [ ] Navigation uses Poppins Bold font
- [ ] Logo click returns to home

### Product Workspace
- [ ] Navigate to `/proofs`
- [ ] Access Gateway shows 3 tabs: Sign In, Sign Up, Sandbox
- [ ] Click any tab shows the appropriate form
- [ ] Click "Sign In" or "Enter Sandbox" enters the workspace

### Subject Context Bar (After auth)
- [ ] Subject bar at top shows: Subject, Type, Organization, Environment, Posture
- [ ] All fields are populated (sub_ai_prod_001, LLM Agent, Acme Corp, Production, Healthy)

### Tabs (Left sidebar)
- [ ] Overview tab loads
- [ ] Proofs tab loads with table
- [ ] Events tab loads with table
- [ ] Traceability tab loads
- [ ] Failures tab loads (shows empty state)
- [ ] Angles tab loads (shows all 7 angles)
- [ ] Settings tab loads

### Overview Tab
- [ ] Shows 4 metric cards (Events, Proofs, Lineages, Failures)
- [ ] Shows "Latest Proof" section
- [ ] Shows "Angle Rollup" with all 7 angles
- [ ] Shows "Recent Activity" feed
- [ ] Shows "Anchor State" section

### Proofs Tab
- [ ] Left panel shows proof list table
- [ ] Right panel shows proof detail when row is clicked
- [ ] Detail shows all sections:
  - Proof Summary
  - Baseline vs Actual
  - Angle Results (7/7)
  - Failure Rollup
  - Evidence References
  - Linked Events
  - Anchor Metadata

### Angles Tab (Critical)
- [ ] Left panel shows all 7 angles always
- [ ] Each angle card shows: name, status badge, BL badge
- [ ] Right panel shows detail when angle is selected
- [ ] Detail shows: status, baseline version, rules, comparison

### Settings Tab
- [ ] Shows API Keys section
- [ ] Shows Account section
- [ ] Shows Organization section
- [ ] Shows Organization Users section
- [ ] Shows Environment section
- [ ] API key can be shown/hidden

## ✅ Visual Check

### Dark Theme
- [ ] Background is dark (#0b0b0c)
- [ ] Text is white/light gray
- [ ] Borders are subtle (rgba(255,255,255,0.1))
- [ ] Cards have soft borders and subtle shadows

### Typography
- [ ] Navigation uses Poppins Bold
- [ ] Monospace font for IDs (proof_id, event_id, etc.)
- [ ] Clean hierarchy throughout

### Components
- [ ] Badges render correctly (green for PASS/Active)
- [ ] Tables are clean and readable
- [ ] Buttons have proper styling
- [ ] Input fields are visible

## 🎯 All Checks Passed?

If everything above works, your setup is complete! 🎉

The Aproof frontend is now ready for:
- Backend integration
- Further development
- Production deployment

---

**Need help?** Check CURSOR_SETUP.md for troubleshooting steps.
