# Aproof Project - Setup Instructions for Cursor

This package contains the complete Aproof frontend application, ready to transfer to Cursor IDE.

## Quick Setup (5 minutes)

### Step 1: Extract the Project

1. Download `aproof-project.tar.gz` from this workspace
2. Extract it to your desired location:
   ```bash
   tar -xzf aproof-project.tar.gz
   cd code
   ```

   **Or on Windows:**
   - Use 7-Zip or WinRAR to extract the `.tar.gz` file
   - Navigate to the extracted `code` folder

### Step 2: Open in Cursor

1. Launch Cursor IDE
2. Go to `File > Open Folder`
3. Select the extracted `code` folder
4. Cursor will open the project

### Step 3: Install Dependencies

Open the integrated terminal in Cursor (`` Ctrl+` `` or `` Cmd+` ``) and run:

```bash
pnpm install
```

**If you don't have pnpm installed:**
```bash
npm install -g pnpm
pnpm install
```

**Or use npm:**
```bash
npm install
```

### Step 4: Start Development Server

```bash
pnpm run dev
# or
npm run dev
```

The app should now be running! 🎉

---

## Project Structure

```
code/
├── src/
│   ├── app/
│   │   ├── App.tsx                 # Main app entry point
│   │   ├── routes.tsx              # React Router configuration
│   │   ├── components/
│   │   │   ├── Logo.tsx            # Aproof logo component
│   │   │   ├── Navigation.tsx      # Top navigation bar
│   │   │   ├── Root.tsx            # Root layout component
│   │   │   ├── proofs/             # Product workspace components
│   │   │   │   ├── ProofsOverview.tsx
│   │   │   │   ├── ProofsProofs.tsx
│   │   │   │   ├── ProofsProofsList.tsx
│   │   │   │   ├── ProofsEvents.tsx
│   │   │   │   ├── ProofsTraceability.tsx
│   │   │   │   ├── ProofsFailures.tsx
│   │   │   │   ├── ProofsAngles.tsx
│   │   │   │   └── ProofsSettings.tsx
│   │   │   └── ui/                 # Shadcn UI components
│   │   └── pages/
│   │       ├── Home.tsx            # Marketing homepage
│   │       ├── Sales.tsx           # Pricing page
│   │       ├── Proofs.tsx          # Product workspace
│   │       ├── Regulatory.tsx      # Legal documents
│   │       └── Contact.tsx         # Contact page
│   ├── imports/
│   │   ├── Untitled_design-1.png   # Aproof logo
│   │   ├── subjects.png            # Subject types image
│   │   └── 7_angles.png            # 7 angles image
│   └── styles/
│       ├── index.css               # Main styles
│       ├── theme.css               # Dark theme configuration
│       ├── fonts.css               # Poppins font import
│       └── tailwind.css            # Tailwind base styles
├── package.json                     # Dependencies
├── vite.config.ts                  # Vite configuration
├── postcss.config.mjs              # PostCSS configuration
└── pnpm-lock.yaml                  # Lock file
```

---

## Key Features Implemented

### Public Pages
- **Home** - Marketing page with hero, features, subject types, 7 angles
- **Sales** - Pricing ($0.05 per anchor)
- **Regulatory** - 7 legal documents (ToS, Privacy, AUP, etc.)
- **Contact** - Contact information

### Product Workspace (`/proofs`)
- **Access Gateway** - Sign in, Sign up, Sandbox modes
- **Subject Context Bar** - Shows subject, type, org, environment, posture
- **Overview Tab** - Operational counts, latest proof, angle rollup, activity feed
- **Proofs Tab** - Forensic proof browser with structured detail sections
- **Events Tab** - Event ledger with canonical views
- **Traceability Tab** - Lineage browser with version progression
- **Failures Tab** - Clinical failure diagnostic
- **Angles Tab** - Always shows all 7 integrity angles
- **Settings Tab** - API keys, account, organization, users, environment

### Design System
- Dark mode enterprise SaaS aesthetic
- Poppins Bold navigation
- Shadcn UI components
- Tailwind CSS v4
- Responsive layout

---

## Technology Stack

- **React 18.3.1**
- **React Router 7.13.0**
- **Tailwind CSS 4.1.12**
- **Vite 6.3.5**
- **Shadcn UI** (Radix UI primitives)
- **Lucide React** (icons)
- **TypeScript**

---

## Troubleshooting

### Issue: `pnpm` command not found
**Solution:**
```bash
npm install -g pnpm
```

### Issue: Port already in use
**Solution:**
The default port is usually 5173. If it's in use, Vite will automatically try the next available port.

### Issue: Dependencies installation fails
**Solution:**
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
# or
npm install
```

### Issue: Styles not loading
**Solution:**
Make sure Tailwind CSS is properly configured. The project uses Tailwind v4 with the `@tailwindcss/vite` plugin.

---

## Development Workflow

### Running the Dev Server
```bash
pnpm run dev
```

### Building for Production
```bash
pnpm run build
```

### Preview Production Build
```bash
pnpm run preview
```

---

## Key Routes

- `/` - Home page
- `/sales` - Sales/Pricing page
- `/proofs` - Product workspace (requires auth in production)
- `/regulatory` - Regulatory suite
- `/contact` - Contact page

---

## Important Notes

1. **Dark Mode Only** - The app is designed exclusively for dark mode (#0b0b0c background)

2. **All 7 Angles Always Shown** - The system always renders all 7 integrity angles, even if some have "no baseline" or "no sources" states

3. **Subject-Based Workspace** - Everything in `/proofs` is scoped to a subject context

4. **No Decorative Elements** - Every UI element maps to a real backend concept

5. **Forensic Tone** - The product feels like an operational verification system, not a marketing dashboard

---

## Next Steps

After setup in Cursor:

1. ✅ Verify the app runs (`pnpm run dev`)
2. ✅ Check navigation works (Home, Sales, Proofs, Regulatory, Contact)
3. ✅ Test the `/proofs` workspace and all tabs
4. ✅ Verify dark theme is applied
5. ✅ Check that the logo displays correctly

---

## Support

If you encounter any issues:

1. Check that you're using Node.js 18+ (`node --version`)
2. Clear node_modules and reinstall dependencies
3. Verify all files extracted correctly
4. Check the browser console for errors

---

## Project Status

**Current State:** Production-grade frontend scaffold
- ✅ All public pages implemented
- ✅ Full product workspace with 8 tabs
- ✅ Dark enterprise SaaS design
- ✅ Subject context management
- ✅ All 7 integrity angles system
- ✅ Proof forensic browser
- ✅ Event ledger
- ✅ Lineage traceability
- ✅ Failure diagnostics
- ✅ Operational settings

**Ready For:** Backend integration

---

Built with ❤️ for AI verification and proof operations.
