# BarTicket Frontend

A responsive bar point-of-sale interface built with React 19, TypeScript, and
Vite 8. It connects to the separate
[BarTicket API](https://github.com/andrewmurphy-dev/BarTicket-API) for accounts,
menu data, tickets, payments, and shift reports.

## Features

- **Ticket dashboard:** create and rename tickets, add drinks, change quantities
  and line prices, manage per-person cover charges, and view open, paid, or
  cancelled tickets. Record cash, card, or other payments and reopen eligible
  paid tickets.
- **Drink menu:** search by item details or price, add drinks, edit existing
  prices, and mark items in or out of stock.
- **Accounts and shifts:** sign in, set up the first manager account, update a
  profile, open and close shifts, and clock in or out. Managers can add and
  remove team members.
- **Notifications:** managers and clocked-in staff can view stock notices;
  managers can mark notice items back in stock.
- **Manager analytics:** view closed-shift revenue, payment breakdowns, guest
  counts, staff hours, stockouts, and ticket history by day, month, year, or all
  time.
- **English and Japanese:** switch languages in the header. The selection is
  saved in the browser; the initial language follows the browser language when
  supported, otherwise English.

Payments here record the payment method and ticket settlement in the backend;
there is no card processor integration. The email-receipt button currently has
no sending behavior.

## Run locally

Use **Node.js 22.13 or later in the Node 22 release line** and npm to match the
Node 22 deployment workflow and the installed tooling's requirements.

1. Clone and install the frontend:

   ```bash
   git clone https://github.com/chulps/barticket-frontend.git
   cd barticket-frontend
   npm ci
   ```

2. Start the backend using its
   [setup instructions](https://github.com/andrewmurphy-dev/BarTicket-API#getting-started).
   Backend repository access is required to follow those instructions. The
   frontend expects the API at `http://localhost:8000` by default.

3. To use a different API, copy the example configuration:

   ```bash
   cp .env.example .env.local
   ```

   Set `VITE_API_URL` in `.env.local` to the backend URL, then restart the dev
   server after any environment change.

4. Start the frontend:

   ```bash
   npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173). Use `localhost` so the
   browser origin matches the backend's default CORS configuration. If Vite
   selects another port, add that exact origin to the backend's `CORS_ORIGINS`.

The UI can start without a backend, but there is no built-in offline/demo data
mode. Menu, account, and ticket operations require a reachable API.

### First shift

On **Profile**, create the initial manager account if the backend has no
accounts, or sign in with an existing account. Open a shift and clock in before
creating a ticket. Managers can create additional staff accounts from Profile.
Pay or cancel remaining open tickets before closing the shift.

The backend assigns business dates using Japan time, with a noon rollover so an
overnight shift stays on the same business date. Closed-shift reports appear in
Analytics.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the versions recorded in `package-lock.json`. |
| `npm run dev` | Start the Vite development server. |
| `npm run lint` | Run ESLint. |
| `npm run i18n:sync` | Scan UI copy and synchronize the translation catalog. |
| `npm run build` | Sync translations, run TypeScript checks, and build to `dist/`. |
| `npm run preview` | Serve the existing production build locally. |

The current `main` branch has no automated frontend test suite or `npm test`
command. For changes, run lint and build, then manually check the affected flow
against a development backend, including both languages and mobile layouts.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | Frontend `.env.local` or build environment | Backend URL; defaults to `http://localhost:8000`. Embedded in the frontend at build time, so rebuild to change a deployed URL. |
| `BASE_PATH` | Build environment | Site base path; defaults to `/`. The deployment workflow sets it to `/<repository-name>/`. |
| `CORS_ORIGINS` | Backend environment | Comma-separated allowed frontend origins, including the local or deployed frontend origin. |

The shared client in `src/api/client.ts` sends JSON requests and attaches a
Bearer token when signed in. The session token is stored in browser local
storage. API failures use the backend's `detail` message when available.

## Project structure

```text
src/
  App.tsx             Routes, shared menu state, and modal provider
  main.tsx            React entry point
  api/                API client and account, menu, notice, and ticket requests
  pages/              Dashboard, Menu, Profile, Analytics, Notifications
  components/         Reusable UI, ticket details, forms, and charts
  hooks/              Ticket operations, menu filtering, and modal access
  context/            Shared modal state
  i18n/               Locale helpers and English/Japanese translations
  layout/             Navigation/header
  types/              Menu, ticket, and modal types
  index.css           Global styles and design variables
scripts/
  sync-translations.mjs
.github/workflows/
  deploy.yml          GitHub Pages build and deployment
```

Styling uses styled-components and global CSS variables. Navigation uses React
Router; icons use Phosphor and ticket-list animations use Motion. Ticket changes
are queued per ticket in `src/hooks/useTickets.ts`, with debounced name saves.
The backend remains responsible for persistence, authorization, and business
rules.

## Translation workflow

`src/i18n/translations.ts` contains the English and Japanese UI catalogs and
Japanese menu labels. Components use `useI18n()` and `t(...)` for interface copy.

`npm run i18n:sync` scans TypeScript/TSX files under `src/` outside `i18n/`. It can
add catalog entries and rewrite recognized UI text to use translations. New or
missing Japanese UI translations are requested from the external MyMemory
service, so those updates need network access. Existing complete translations
do not require a request. Unknown message keys that are not recognized as new
English copy cause the script to fail.

Because `npm run build` runs this script first, **a build can modify source
files**. Review the resulting diff and Japanese wording before committing.
Menu-label translations are maintained separately in the `menuJa` mapping.

## Deploy to GitHub Pages

The [deployment workflow](.github/workflows/deploy.yml) builds and publishes on
pushes to `main` and can also be started manually from GitHub Actions.

Repository setup:

1. Under **Settings → Pages → Build and deployment**, select **GitHub Actions**.
2. Under **Settings → Secrets and variables → Actions → Variables**, set
   `VITE_API_URL` to the hosted backend URL.
3. Configure the backend's `CORS_ORIGINS` to include `https://chulps.github.io`
   (or the corresponding origin for your own deployment).

The workflow uses Node 22, runs `npm ci` and `npm run build`, and sets
`BASE_PATH` to `/<repository-name>/`. It copies `dist/index.html` to
`dist/404.html` to serve the app on direct visits to nested routes.

For this repository, the expected site URL is
[https://chulps.github.io/barticket-frontend/](https://chulps.github.io/barticket-frontend/).
If the build variable is missing, the deployed app falls back to
`http://localhost:8000`, which points at each visitor's machine. Configure the
hosted API URL before deploying.

The GitHub Pages workflow reads `VITE_API_URL` from the repository's GitHub Actions secret (`secrets.VITE_API_URL`) at build time. Populate that secret with the current API base URL and rebuild after changing it. Note that Vite embeds the value into the publicly downloadable frontend bundle: storing the build setting as a secret keeps it out of repository source but does not conceal the API hostname from browser users.

## Troubleshooting

- **Menu or requests fail:** check that the backend is running and that
  `VITE_API_URL` points to it. Inspect the browser Network panel for the failing
  response.
- **CORS errors:** allow the exact frontend origin, including its port, in the
  backend's `CORS_ORIGINS`. An origin does not include the repository path.
- **New Ticket is disabled:** sign in, open a shift, and clock in from Profile.
- **Analytics is unavailable:** sign in as a manager; reports use closed shifts.
- **Translation sync fails:** check for unknown translation keys and, if new
  Japanese translations are needed, errors from the translation service.
