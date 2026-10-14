# Revenue-share preview (frontend only)

Tracking: [frontend #89](https://github.com/chulps/barticket-frontend/issues/89) ↔ [backend #79](https://github.com/andrewmurphy-dev/BarTicket-API/issues/79).

The manager-only **Admin → Team → Chuck's profile** can show a revenue-share *planning* card. It starts with the proposed 40% base below ¥500,000, +1 percentage point per ¥50,000 from ¥500,000, and a **proposed 60% cap at ¥1,450,000** in monthly Chuck-managed revenue. Nori-managed shifts must be excluded from both the rate and revenue share. The source data currently does not reliably identify the designated manager for each shift.

## Private preview access

**This card must appear ONLY on Chuck's own team profile, to the signed-in manager accounts Chuck and Nori.** It is never rendered on another team member's profile.

Set these **GitHub Actions repository variables** before publishing the card (Settings → Secrets and variables → Actions → Variables):

- `VITE_REVENUE_SHARE_CHUCK_USER_ID`: the verified numeric `/auth/me` user ID for Chuck.
- `VITE_REVENUE_SHARE_NORI_USER_ID`: the verified numeric `/auth/me` user ID for Nori.

They must both be distinct valid IDs. An omitted, invalid or equal ID will **hide the entire feature by default**. Neither display names, email strings, nor `role === manager` alone unlock it. These Vite build variables are **public** in the browser build; they must **never** contain tokens, passwords or confidential data. The frontend gate is **not a privacy boundary**: the backend must independently authorize any future private payroll read or write, or another user could bypass the UI check with direct requests. No new backend endpoints are used by this PR.

## What the draft controls allow

Chuck and Nori can locally change the proposed base percentage, threshold, revenue increments, percentage-point increments, maximum percentage, qualifying shift selection, and sample cost/adjustment values.

- Draft selections and figures stay only in component state; **Save** remains **disabled**. There are no new writes, database records, localStorage or sessionStorage.
- All candidate shifts start unchecked. A shift opener is not proof of its designated manager; selecting a shift is **not** verification or a persistent attribution.
- Preview revenue uses currently recorded `paid_total` as a *temporary stand-in*. Revenue definitions, covering refunds/waivers, need approval.
- Flat whole-month-tier and marginal/tranche examples are shown side by side because the real allocation rule is **not yet confirmed**.
- Staff wages, drinkback, deductions and additions start **blank**, not `0`. Missing inputs suppress net examples. A component of wages inclusive of drinkback must not be deducted twice.
- Changing accounts resets all draft values; changing months clears shift and cost inputs, but keeps the local draft policy.
- This is **not a payslip or settled compensation**. Real manager attribution, rate histories, cost detail, approvals, audit and settlement require backend #79 and #78.

Manual acceptance before merge: confirm ID vars configured in deployment settings only after verifying Chuck/Nori IDs; test Chuck/Nori visibility in their own accounts, block a third manager, block staff and other profile URLs, verify Japanese copy, mobile layout, tier boundaries and clearing/reset.

## Reproducible CI and deployment builds

`npm run build` uses the **committed English/Japanese catalogs** and does not call external translation services. `npm run i18n:sync` is an **explicit, optional development command** that may contact MyMemory and must be reviewed and committed by a developer separately. This avoids CI/deployment failures when the free translation service returns HTTP 429 and prevents a production build from unexpectedly rewriting translation files.
