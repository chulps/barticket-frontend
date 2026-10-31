# Active-session deployment safety (#330)

## Cause and fix

The push-only worker has no cache/activation/reload handlers. The prior App used
five React.lazy routes and Suspense without error containment. Replacing the
Pages artifact removed older hashed route files. An open old document requested
those removed files on first navigation; the rejected import unmounted React's
root, leaving the black body. Vite documents this deployment failure mode:
https://vite.dev/guide/build.html#load-error-handling

All route code now loads in the initial module graph. Importing a route does not
mount it or run its effects/API reads. Existing sessions can navigate without
fetching another JS chunk. A route boundary leaves the shell, auth/menu state and
modal host mounted if a render/import fails. There is deliberately no automatic
reload, retry loop, worker takeover, cache deletion, storage clearing, or payment
replay. The user is told to finish work and verify payment outcomes before a
manual refresh; this is not a claim that arbitrary failed route-local state can
be restored. Already-loaded old clients cannot retroactively gain the boundary.

## Public asset continuity and limits

Every deployment retains hashed public assets for 30 days after their last
current build. Only JS/CSS/font/image assets survive; never old HTML, workers,
manifest, sourcemaps, API data or symlinks. A timestamp ledger prevents repeatedly
copying assets from extending their retention. Current assets always win.

The next deployment downloads the last successful `main` Pages artifact. When
that artifact predates the ledger, it bootstraps all still-available successful
main deployments from the preceding 30 days, including sessions older than the
immediately preceding release. Expired historical artifacts are reported; they
cannot be reconstructed automatically. This limitation applies to clients
already broken before the fix. The required immediately preceding archive being
missing fails the deployment before publication, rather than silently losing
continuity. Pages archives are retained for 90 days, subject to repository limits.
If there has been no deployment for over 90 days, restore the last public archive
through a reviewed change before deployment; do not bypass the gate.

Legacy lazy clients older than the 30-day asset window are not guaranteed. Eager
clients have all route code in memory and do not need that history for navigation.
No offline-write capability is added; API operations still require connectivity.
No update is forced into a running session. Fresh loads naturally get the current
version. Browser storage eviction/OS termination is not prevented by this fix.

## Size and verification

Same Vite production build, isolated localhost API configuration: prior initial
entry 212,774 gzip bytes plus shared runtime 27,338 (~240 KB); eager single module
315,663 (~316 KB), roughly +75 KB/+31% initial transfer. Prior total JS across all
routes was ~322 KB. No new dependency. The tradeoff removes deployment-time
navigation network dependence; do not reintroduce lazy routes without equivalent
version-safe asset delivery and interruption tests.

`node --test tests/*.test.mjs` includes the retention policy and containment
structure. The browser workflow builds separate old/new production fixtures and
runs `playwright.deployment.config.mjs`: original blackout reproduction, retained
legacy assets, contained missing-chunk recovery, and an unsaved edit dialog that
survives deployment followed by offline navigation and explicit manual reload.
All API calls are mocked at 127.0.0.1; no live POS data or payments are touched.
