# iPhone PWA + push preview (production stays on GitHub Pages)

## Isolation rules

Do **not** deploy this branch with the existing GitHub Pages production workflow.
GitHub Pages has only one site per repository; a branch deployment could replace
the live app. Use a **separate Vercel Hobby frontend project** for this preview.
The frontend is static; production remains on GitHub Pages.

**Never point the preview backend at the production database.** Ticket creation,
payment, stock and clock-in tests modify data. A test database must be provisioned
before enabling the preview. Use separate VAPID keys for preview and production.

## 1. Backend preview

- In Vercel, make sure the BarTicket-API GitHub repository is connected and
  preview deployments are enabled for PR #58 (`feat/web-push-events`).
- Configure **Preview** environment variables on the API Vercel project:
  - `DATABASE_URL`: a **separate test PostgreSQL database**, not production
  - `DATABASE_URL_UNPOOLED`: optional matching direct URL for that test DB
  - `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`: a dedicated
    preview VAPID key pair (see backend `docs/web-push.md`)
  - `CORS_ORIGINS`: the HTTPS origin of the frontend preview deployment
- Confirm the preview backend's build runs Alembic against the **test** DB.
- Find the preview API URL on Vercel's Deployments tab and verify `/docs`
  loads. **Do not use the production API URL.**
- Avoid exposing preview API routes to arbitrary visitors; use disposable
  test credentials, and never use real customer information. Vercel deployment
  protection can block cross-origin browser calls, so test auth and CORS
  explicitly before using iPhone push.

## 2. Frontend preview

- Create a separate **Vercel Hobby** project importing
  `chulps/barticket-frontend` (do not move the existing GitHub Pages project).
- Choose Vite framework, root directory `./`, install `npm ci`,
  build `npm run build`, output directory `dist`.
- Set **Preview** environment variable `VITE_API_URL` to the **backend
  preview URL** (no trailing slash). Leave `BASE_PATH` unset for root
  hosting. The build generates a root-scoped PWA manifest.
- Set the project's Production Branch to a non-production branch if
  necessary; do not publish this preview as the primary production site.
- Deploy `feat/pwa-web-push` (frontend PR #57). Record the HTTPS preview URL.
- Update the backend `CORS_ORIGINS` to include this exact preview origin,
  then redeploy the backend preview if required. For stable iPhone installs,
  prefer a stable branch alias; changing origins can require reinstalling.
- Vercel's Deployment Protection / authentication may prevent installed
  PWAs and their service workers from fetching assets. Use an appropriately
  restricted test URL accessible to your test device and enforce application
  login; do not expose real data.

## 3. iPhone test

1. In Safari, open the **frontend preview HTTPS URL**, sign in as test staff.
2. Share > **Add to Home Screen**; open BarTicket from the new Home Screen icon.
3. Go to Notifications > **Enable push on this device** > Allow.
4. On a second test device, clock in/out, create and edit a ticket, add a
   staff drink, pay/cancel a ticket, close a shift, and toggle stock.
5. Confirm notifications arrive on the installed iPhone app while the app is
   in the background and when the phone is locked.
6. Test disabled permission, sign-out, and two-device behavior. Test push
   failures do not block business actions.

**Status:** The repository configuration does not provision Vercel projects,
databases, domains, or secret values. Those require owner access to Vercel and
the database provider. Do not merge PRs until live-device testing is complete.
