# Bounded design audit corrections (#347, #348, #349)

Baseline: `5b986aed0d377e45a0e46583ba55204d2e99a2a4` (all source
blobs verified against tree `1f5305ccb5af3a55968e5a3ce3b152f329570961`).

- Keep Profile/Admin's existing dark cards in both CSS themes, but explicitly
  pair their surface and foreground. Labels use their own readable semantic
  foreground rather than the secondary button background. Input foregrounds
  remain paired with theme input backgrounds. Light primary and primary hover
  colors use royal-600; success/warning palette and disabled styling are unchanged.
- Execute RequestState's compact and warning styled-component interpolations.
  Inherit the surrounding text foreground instead of hard-coding a light
  foreground on a potentially light surface. Announcements/retry behavior remain.
- Use native form submission with required email/name/password autofill semantics
  in signed-out Profile. A synchronous operation guard prevents duplicate pending
  submissions. No authentication API, token, account, or authorization policy changes.

## Verification

`node --test tests/*.test.mjs`, `npm run build`, `npm run lint`, and the
source/dist security audits are the local gates. The pre-existing
ShiftCloseReview exhaustive-deps warning is not changed by this patch.

The new unit regression renders the real RequestState through styled-components
for every kind, locale and compact state, inspecting emitted CSS. Browser
regressions inspect computed styles, contrast with effective backgrounds, native
Enter/pointer submission, invalid and pending input, failed authentication and
successful synthetic navigation. They use only an intercepted loopback API with
synthetic identities; never a live sign-in or account creation.

Browser execution is delegated to the existing GitHub Actions workflow because
local Chromium execution is unavailable in this environment. Browser test listing
is not rendered verification. Preserve synthetic screenshots as the internal
`design-audit-visuals` Actions artifact; they are not customer screenshots.
No merge or deployment is part of this correction.
