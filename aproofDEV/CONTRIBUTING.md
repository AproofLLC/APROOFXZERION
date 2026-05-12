# Contributing

## Setup

- Install [Node.js](https://nodejs.org/) 20 or newer.
- From the repository root: `npm install`
- Backend package: `cd APROOF && npm install`
- Frontend: `cd frontend && npm install`

## Environment

- Copy `APROOF/.env.example` to `APROOF/.env` and fill in **local-only** values.
- **Do not** commit `.env`, `.env.*` (except examples), `.local/`, keypair JSON, API keys, or wallet material.

## Tests

From the repository root:

```bash
npm run verify
```

Backend only (from `APROOF/`):

```bash
npm run verify:all
```

## Branches and PRs

- Prefer small, focused changes with a clear description.
- Run `npm run verify` before opening a pull request.
- If you add scripts or docs that mention file paths, use placeholders such as `<repo>/APROOF/.local/...`, not personal absolute paths.
