# Frontend security exposure audit — 2026-10-17

Scope: BarTicket React source, client API/auth helpers, GitHub Actions workflows, and the published-build configuration. No backend source, database contents, or GitHub secret values were changed or reviewed.

## Findings

- Application JSX displays ticket, staff and menu text through React's escaped text nodes; no explicit `dangerouslySetInnerHTML`, DOM `innerHTML` assignment, `eval`, or `new Function` sinks were found in inspected source.
- The analytics LINE share destination is a fixed `https://line.me/R/share` URL with report text passed through `encodeURIComponent`, and external-link `rel="noopener noreferrer"` is present.
- Authentication bearer tokens are stored in `localStorage` and attached to same API requests. This means a future XSS would be especially consequential. Mitigating token storage/session design is separately tracked in frontend #103 and backend #81.
- `VITE_API_URL` and manager allowlist IDs are public build-time values, even when their source is GitHub Actions Secrets. No actual credentials belong in `VITE_*` variables.
- GitHub Pages currently has explicit least-privilege workflow permissions, and frontend PR checks have read-only repository permissions. Source maps are disabled explicitly and CI rejects source maps and obvious secrets/unsafe injection sinks before deployment.
- Separate frontend #102 / backend #80 work remains essential to establish server-enforced access control over sensitive payroll, shifts, and staff data.

## Scope limitations

This is a static frontend audit and regression guardrail, **not a penetration test or certification of zero vulnerabilities**. It does not prove historical Git blobs are free of secrets, audit third-party dependencies or the runtime backend, verify live authorization behavior, or make client-side salary gates a substitute for server permissions.

## Follow-up

- Maintain frontend #103 and backend #81 for session/token improvements.
- Complete frontend #102 and backend #80 for data/role authorization.
- Keep PR #98 (`.gitignore` credential exclusion) in the security backlog until merged.
- Run security checks on all PRs and on GitHub Pages builds.
