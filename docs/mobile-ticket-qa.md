# Mobile ticket / search QA — #107

This PR fixes modal footer positioning, minimum flex sizes, safe-area padding, and nested scrolling. Its source assertions are **not a substitute for hands-on device verification**.

## Manual verification checklist

Test English and Japanese layouts at these viewport conditions:
- 320 × 568 narrow phone, 375 × 667 phone, 390 × 844 phone, 768 × 1024 tablet.
- Portrait and landscape; if possible iOS Safari and Android Chrome.
- Add Drink picker with several results, many selected drinks, and keyboard open.
- Menu sticky search while scrolling past many categories.
- Ticket details → Close Ticket → Back, Cancel Ticket → No/Yes, Take Payment → Cancel/confirm.
- Price editor dialog on narrow viewport, keyboard open, and safe-area bottom.
- Ensure scroll stays in the intended panel, search remains reachable, buttons are not clipped, and modal dismiss gestures work.
- Ensure no accidental duplicate charges: **do not use real tickets or live payments for QA**.

## Status

Static layout changes and regression checks are implemented. **Live mobile device verification is outstanding**, so issue #107 must stay open until a tester confirms the matrix. The server-side payment behavior is unchanged.

## 2026-10-17 additional frontend hardening

- Modal dialogs now contain Tab/Shift+Tab focus, restore focus on close, and lock background scrolling.
- Mobile ticket payment controls use a safe-area-aware sticky footer; header navigation controls have 44px targets.
- Menu search uses a 16px input and a 44px target to avoid iOS's automatic input zoom.
- Automated static regressions validate keyboard behavior and responsive CSS hooks; these tests do **not** simulate physical devices or real payments.

**Outstanding before closing #107:** Run the above viewport matrix in a real narrow browser, open/close the mobile keyboard, verify scroll position and focus restoration, and test payment/cancellation only against isolated test data. Do not execute live financial writes as part of QA.
