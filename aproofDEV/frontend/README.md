# Aproof frontend

React + Vite app for the proof dashboard. Proxies API calls to the backend in dev when `VITE_API_BASE_URL` is unset (see `vite.config.ts`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (default port 5173) |
| `npm run build` | Typecheck + production bundle |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm run preview` | Preview production build |

## Requirements

- Node ≥ 20
- Backend running (e.g. `cd ../APROOF && npm run dev` on port 3000)
