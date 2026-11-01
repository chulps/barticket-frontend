import { test, expect } from "@playwright/test";

// Synthetic-only route fixtures. All external traffic and unexpected writes blocked.
const manager = { id: 901, name: "Fixture Manager", email: "manager@example.invalid", role: "manager", has_password: true };
const staff = { id: 903, name: "Fixture Staff", email: "staff@example.invalid", role: "staff", has_password: true };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
const schedule = (state, id) => ({ id, business_date: `2026-11-0${id}`, schedule_state: state, actual_shift_exists: id === 3,
  manager: { name: manager.name, user_id: manager.id }, staff: [{ name: staff.name, user_id: staff.id }], event_value: null, hours: null,
  provenance: [{ source_file: "synthetic-november.csv", source_row: id + 1, imported_by: "Fixture Manager", imported_at: "2026-11-01T00:00:00Z", uncertainty: "Synthetic review note" }] });
async function fixture(page, locale, role = "manager") {
  const state = { mode: "rows", reads: 0, writes: [], previews: 0 };
  await page.addInitScript(({ locale }) => { localStorage.clear(); localStorage.setItem("barticket_locale", locale); localStorage.setItem("barticket_token", "ISOLATED_SCHEDULE_AUDIT"); }, { locale });
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.route("http://127.0.0.1:8765/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    let status = 200, data = [];
    if (path === "/schedules/reconcile" && request.method() === "POST") {
      state.previews++;
      const body = request.postDataJSON();
      data = { mode: "READ_ONLY_SCHEDULE_RECONCILIATION", source_file: body.source_file, today_business_date: "2026-11-01", counts: { new: 1, match: 0, already_imported: 0, unmapped: 0, conflict: 0 }, rows: body.rows.map(row => ({ ...row, status: "new", schedule_state: "upcoming", actual_shift_exists: false, problems: [] })) };
    } else if (request.method() !== "GET") { state.writes.push(path); status = 405; }
    else if (path === "/auth/me") data = role === "manager" ? manager : staff;
    else if (path === "/users") data = [manager, staff];
    else if (path === "/auth/status") data = { has_accounts: true, google_enabled: false };
    else if (path === "/admin/payment-setup/access") data = { can_configure: false };
    else if (path === "/shifts/current") data = null;
    else if (path === "/menu") data = { items: [], coverCharge: 500 };
    else if (path === "/notices") data = { notices: [] };
    else if (path === "/schedules") {
      state.reads++;
      if (state.mode === "error") { status = 503; data = { detail: "Synthetic schedule unavailable" }; }
      else data = state.mode === "empty" ? [] : [schedule("upcoming", 1), schedule("today", 2), schedule("past", 3)];
    }
    await route.fulfill({ status, json: data, headers: cors });
  });
  return state;
}
async function fits(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth)); }
async function capture(page, testInfo, name) { await page.screenshot({ path: testInfo.outputPath(`audit-schedule-${name}.png`), fullPage: true }); await fits(page); }
for (const locale of ["en", "ja"]) for (const width of [320, 768, 1280]) {
  test(`schedule states and keyboard recovery ${locale} ${width}`, async ({ page }, testInfo) => {
    const state = await fixture(page, locale, "staff");
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/schedules");
    await expect(page.locator("main article")).toHaveCount(3);
    await expect(page.locator("main")).toContainText(locale === "ja" ? "不明・取り込みなし" : "Unknown · not imported");
    await capture(page, testInfo, "rows");
    state.mode = "empty";
    await page.evaluate(() => window.dispatchEvent(new Event("barticket-schedules-updated")));
    await expect(page.getByText(locale === "ja" ? "この期間に予定はありません" : "No scheduled shifts in this period.", { exact: true })).toBeVisible();
    await capture(page, testInfo, "empty");
    state.mode = "error";
    await page.evaluate(() => window.dispatchEvent(new Event("barticket-schedules-updated")));
    const retry = page.getByRole("button", { name: locale === "ja" ? "再試行" : "Retry", exact: true });
    await expect(retry).toBeVisible();
    await expect(page.locator("main article")).toHaveCount(0);
    await retry.focus(); await expect(retry).toBeFocused();
    await capture(page, testInfo, "error");
    state.mode = "rows";
    await retry.press("Enter");
    await expect(page.locator("main article")).toHaveCount(3);
    await expect(retry).toHaveCount(0);
    expect(state.writes).toEqual([]);
  });
  test(`admin schedule preview cancel and role boundary ${locale} ${width}`, async ({ page }, testInfo) => {
    const state = await fixture(page, locale);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin?section=schedules");
    const file = page.locator('input[type="file"]');
    await expect(file).toBeVisible();
    await capture(page, testInfo, "admin-empty");
    await file.setInputFiles({ name: "synthetic-november.csv", mimeType: "text/csv", buffer: Buffer.from("Date,Manager,Staff,Event\n2026-11-02,Fixture Manager,Fixture Staff,Synthetic event\n") });
    const review = page.getByRole("button", { name: locale === "ja" ? "予定を照合してレビュー" : "Review schedule rows", exact: true });
    await expect(review).toBeEnabled(); await review.focus(); await review.press("Enter");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await capture(page, testInfo, "admin-preview");
    const save = page.getByRole("button", { name: locale === "ja" ? /選択した予定を保存/ : /Save selected schedules/ });
    await expect(save).toBeDisabled();
    await page.getByRole("button", { name: locale === "ja" ? "安全な行をすべて選択" : "Select eligible rows", exact: true }).click();
    await expect(save).toBeEnabled();
    page.once("dialog", dialog => dialog.dismiss());
    await save.focus(); await save.press("Enter");
    await expect(save).toBeFocused();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    expect(state.previews).toBe(1); expect(state.writes).toEqual([]);
    await page.getByRole("button", { name: locale === "ja" ? "選択解除" : "Clear selection", exact: true }).click();
    await expect(save).toBeDisabled();
  });
  test(`staff cannot open admin schedule import ${locale} ${width}`, async ({ page }) => {
    const state = await fixture(page, locale, "staff");
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin?section=schedules");
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    expect(state.previews).toBe(0); expect(state.writes).toEqual([]);
  });
}
