import { test, expect } from "@playwright/test";

const scheduleRevision = "a".repeat(64);
const manager = { id: 901, name: "Fixture Manager", role: "manager", email: "manager@example.invalid" };
const staff = { id: 903, name: "Fixture Staff", role: "staff", email: "staff@example.invalid" };

async function setup(page, role = "staff", locale = "en") {
  const state = { writes: [], requests: [], request: null, staffIds: [903, 904], lastInbox: [], scheduleReads: 0 };
  await page.clock.install({ time: new Date("2026-11-02T12:00:00Z") });
  await page.addInitScript(({ locale }) => {
    localStorage.setItem("barticket_token", "TIME_OFF_TEST");
    localStorage.setItem("barticket_locale", locale);
  }, { locale });
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.route("http://127.0.0.1:8765/**", async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let status = 200, body = {};
    if (req.method() !== "GET") state.writes.push({ method: req.method(), path, payload: req.postDataJSON() });
    if (path === "/auth/status") body = { has_accounts: true, google_enabled: false };
    else if (path === "/auth/me") body = role === "manager" ? manager : staff;
    else if (path === "/users") body = [manager, staff, { id: 904, name: "Other Staff", role: "staff" }];
    else if (path === "/schedules/context") body = { operational_business_date: "2026-11-02", calendar_business_date: "2026-11-02", actual_shift_status: null, actual_shift_business_date: null };
    else if (path === "/schedules") {
      state.scheduleReads++;
      body = [{
      id: 31, business_date: "2026-11-02", manager: { name: manager.name, user_id: 901 },
      staff: state.staffIds.map(id => ({ name: id === 903 ? staff.name : "Other Staff", user_id: id })),
      event_value: "Open", schedule_type: "open", revision: scheduleRevision,
      schedule_state: "upcoming", actual_shift_exists: false, actual_shift_status: null,
      actual_shift_closed_at: null, venue_status: null, venue_event: null, hours: null, provenance: [],
      }];
    }
    else if (path === "/time-off/requests" && req.method() === "GET") body = state.request ? [state.request] : [];
    else if (path === "/time-off/requests" && req.method() === "POST") {
      const payload = req.postDataJSON();
      expect(payload).toMatchObject({ scheduled_shift_id: 31 });
      state.request = { id: 501, scheduled_shift_id: 31, requester_user_id: 903, requester_name: staff.name, manager_user_id: 901, business_date: "2026-11-02", reason: payload.reason, status: "pending", revision: 1, schedule_revision: scheduleRevision, created_at: "2026-11-02T12:00:00Z", decided_at: null };
      body = state.request;
    } else if (path === "/time-off/inbox") {
      body = role === "manager" && state.request?.status === "pending" ? [{ id: 801, request: state.request, kind: "request", is_read: false, created_at: state.request.created_at }] : [];
      state.lastInbox = body;
    } else if (path === "/time-off/requests/501") body = state.request;
    else if (path === "/time-off/requests/501/approve" || path === "/time-off/requests/501/decline") {
      const decision = path.endsWith("approve") ? "approved" : "declined";
      const payload = req.postDataJSON();
      expect(payload).toEqual({ expected_revision: 1, expected_schedule_revision: scheduleRevision });
      state.request = { ...state.request, status: decision, revision: 2, decided_at: "2026-11-02T12:01:00Z" };
      if (decision === "approved") state.staffIds = [904];
      body = state.request;
    } else if (path === "/time-off/inbox/801/read") body = { id: 801, is_read: true };
    else if (path === "/shifts/current") body = null;
    else if (path === "/menu") body = { items: [], coverCharge: 500 };
    else if (path === "/notices") body = { notices: [] };
    else if (path.startsWith("/push/")) { status = 503; body = { detail: "Disabled in isolated browser test" }; }
    return route.fulfill({ status, json: body, headers });
  });
  return state;
}

async function openSelectedDay(page, state, locale = "en") {
  await page.goto("/schedules");
  await expect.poll(() => state.scheduleReads).toBeGreaterThan(0);
  await page.getByRole("button", { name: locale === "ja" ? "今日" : "Today", exact: true }).click();
  const details = page.getByRole("complementary", { name: locale === "ja" ? "選択した日" : "Selected day" });
  await expect(details).toBeVisible();
  await expect(details.locator("dl dd").nth(1)).toContainText("Fixture Staff");
}

test("staff submits an optional-reason request and sees pending state on mobile", async ({ page }, info) => {
  const state = await setup(page, "staff", "en");
  await page.setViewportSize({ width: 390, height: 844 });
  await openSelectedDay(page, state);
  await expect(page.getByLabel("Short reason (optional)")).toBeVisible();
  await page.getByLabel("Short reason (optional)").fill("Family commitment");
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(page.getByText("Pending manager review", { exact: true })).toBeVisible();
  expect(state.writes.filter(write => write.path === "/time-off/requests")[0].payload.reason).toBe("Family commitment");
  await page.screenshot({ path: info.outputPath("staff-time-off-pending-mobile.png"), fullPage: true });
});

test("assigned manager approves and only the requester leaves the planned assignment", async ({ page }, info) => {
  const state = await setup(page, "manager");
  state.request = { id: 501, scheduled_shift_id: 31, requester_user_id: 903, requester_name: staff.name, manager_user_id: 901, business_date: "2026-11-02", reason: "Family commitment", status: "pending", revision: 1, schedule_revision: scheduleRevision, created_at: "2026-11-02T12:00:00Z", decided_at: null };
  await page.setViewportSize({ width: 390, height: 844 });
  await openSelectedDay(page, state);
  const card = page.getByText("Fixture Staff", { exact: true }).last().locator("..") ;
  await expect(page.getByText("Family commitment", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("manager-time-off-review-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Approved. The staff member was removed from the planned day.");
  await expect.poll(() => state.staffIds).toEqual([904]);
  expect(state.writes.some(write => write.path.endsWith("/approve"))).toBe(true);
  await expect(page.getByRole("complementary", { name: "Selected day" }).locator("dl dd").nth(1)).toHaveText("Other Staff");
});

test("decline leaves the schedule unchanged and Japanese day detail remains usable", async ({ page }) => {
  const state = await setup(page, "manager", "ja");
  state.request = { id: 501, scheduled_shift_id: 31, requester_user_id: 903, requester_name: staff.name, manager_user_id: 901, business_date: "2026-11-02", reason: null, status: "pending", revision: 1, schedule_revision: scheduleRevision, created_at: "2026-11-02T12:00:00Z", decided_at: null };
  await page.setViewportSize({ width: 320, height: 700 });
  await openSelectedDay(page, state, "ja");
  await expect(page.getByText("理由の記載なし", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "却下", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("却下しました。予定は変更されていません。");
  expect(state.staffIds).toEqual([903, 904]);
  await expect.poll(() => state.request.status).toBe("declined");
});

test("manager inbox opens the linked request deep link", async ({ page }) => {
  const state = await setup(page, "manager");
  state.request = { id: 501, scheduled_shift_id: 31, requester_user_id: 903, requester_name: staff.name, manager_user_id: 901, business_date: "2026-11-02", reason: "Family commitment", status: "pending", revision: 1, schedule_revision: scheduleRevision, created_at: "2026-11-02T12:00:00Z", decided_at: null };
  await page.goto("/notifications");
  await page.getByRole("button", { name: /Time-off request to review.*2026-11-02.*Fixture Staff.*Pending/s }).click();
  await expect(page).toHaveURL(/\/schedules\?time_off=501/);
  await expect(page.getByRole("complementary", { name: "Selected day" })).toContainText("Family commitment");
  expect(state.writes.some(write => write.path === "/time-off/inbox/801/read")).toBe(true);
});

test("a staff account does not display another staff member's manager inbox item", async ({ page }) => {
  const state = await setup(page, "staff");
  state.request = { id: 501, scheduled_shift_id: 31, requester_user_id: 904, requester_name: "Other Staff", manager_user_id: 901, business_date: "2026-11-02", reason: "Private note", status: "pending", revision: 1, schedule_revision: scheduleRevision, created_at: "2026-11-02T12:00:00Z", decided_at: null };
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Time-off requests", exact: true })).toHaveCount(0);
  await expect(page.getByText("Private note", { exact: true })).toHaveCount(0);
  expect(state.lastInbox).toEqual([]);
});
