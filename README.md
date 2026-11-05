# PortLess operator console (UI)

React + TypeScript + Vite console for the operator. Like MakeMeRich, it signs people in at
**auth-service** and reaches the backend through the shared **RouteToRich API gateway**;
counterparties never use it — buyers and suppliers act by e-mail.

## Repository layout

The backend lives in its own repo, [RouteToRich/portless](https://github.com/RouteToRich/portless).
Check both out side by side:

```
RouteToRich/
├─ portless/      ← backend (FastAPI monolith on :8081)
└─ portless-ui/   ← this repo
```

## Stack

React 18, TypeScript, Vite, TanStack Query, React Router, Axios, Tailwind + Radix
primitives. Types, endpoints and hooks live in `src/api/`; pages in `src/pages/`.

## Screens

| Route | Screen | What the operator does there |
|---|---|---|
| `/radar` | Opportunity Radar | Ranked HS-code × market opportunities from the scan (own Apify actors), source health, start a deal |
| `/catalogue` | Catalogue | Product lines and corridors that drive scans, actor inputs and outreach copy; scan the catalogue |
| `/deals` | Deal Board | Kanban across the deal state machine |
| `/deals/:id` | Deal Detail | Overview (parties, enrichment, buyer outreach funnel), Negotiation (rounds, e-mail thread, drafts), Logistics (QC, freight, milestones, tracking), Documents (PI/PO, document pack, evidence pack), Payments (escrow, tranches, acceptance window, ledger, journal + CSV), Timeline |
| `/approvals` | Approvals Inbox | Every waiting gate with payload, risk flags, timeout, four-eyes state; approve / reject / edit a draft |
| `/money` | Money & Margin | Projected vs realised margin, escrow ledgers across deals |
| `/exceptions` | Exceptions | Open exceptions, the resolver's plan, the playbook an approval will run |
| `/autonomy` | Autonomy Settings | Per-action level, timeout, on-timeout default, value threshold; money ceiling and four-eyes |
| `/health` | System Health | Downstream health, production readiness checks, data sources and Apify run budget, operator digest |
| `/admin/organizations` | Organizations | Buyer / supplier organizations and users |

Live updates: the Approvals Inbox subscribes to `GET /hitl-approval/stream` (SSE) with the
token as a query parameter.

## Sign-in and routing

Every request is same-origin; the rewrite layer forwards it (`vercel.json` deployed,
`proxy.config.mjs` in dev — the same routing as MakeMeRich):

| Path | Goes to | What |
|---|---|---|
| `/auth/*` | `<gateway>/auth/*` | auth-service: sign-up, sign-in, refresh (rotating), sign-out |
| `/api/*` | `<gateway>/api/portless/*` | the PortLess backend |
| `VITE_SSE_BASE_URL/hitl-approval/stream` | the backend directly | the one stream a serverless gateway cannot hold open |

Sign-in and sign-up send `account_id` = `VITE_PORTLESS_ACCOUNT_ID`, PortLess's app account in
auth-service (from the account-management console). Until it is set, the sign-in page says
so and refuses to submit. After sign-in the console reads `GET /api/identity/me` — the
organization and Portless-staff flag the backend keeps — and refreshes the token two
minutes before it expires.

## Configure and run

```bash
cp .env.example .env # set VITE_PORTLESS_ACCOUNT_ID once the app account exists
npm install
npm run dev          # http://localhost:5173 — /auth via the gateway, /api → BACKEND_PROXY_TARGET
npm run lint         # tsc --noEmit
npm run build        # production bundle in dist/
```

Dev routing: `/auth/*` always goes to `GATEWAY_PROXY_TARGET` (default the deployed gateway).
`/api/*` goes straight to `BACKEND_PROXY_TARGET` (e.g. the local monolith on 8081, which
checks each token with the gateway itself) or, when that is empty, through the gateway's
`/api/portless`. Sign in with an account whose e-mail is on the backend's
`AUTH_PORTLESS_EMAILS` allowlist to see the operator screens; other accounts see only their
own organization's deals once a Portless admin assigns them one.

## Deploy (Vercel)

`vercel.json` holds the rewrites above. Set in the project's environment, then redeploy
(Vite inlines `VITE_*` at build time):

- `VITE_PORTLESS_ACCOUNT_ID` — PortLess's app account id
- `VITE_SSE_BASE_URL` — the backend's public URL (the backend's `FRONTEND_URL` must be
  this site's origin)

The gateway must route `/api/portless` to the PortLess backend.
