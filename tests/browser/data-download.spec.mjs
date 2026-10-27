import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const origin = "http://127.0.0.1:8765";
const manager = { id: 7, name: "Manager", email: "test@example.invalid", role: "manager" };
const shift = { id: 3, business_date: "2026-10-17", status: "closed", opened_at: 1792240000,
  closed_at: 1792264000, opened_by: "Manager", closed_by: "Manager", paid_total: 0, cash_total: 0,
  card_total: 0, other_total: 0, cover_total: 0, guest_count: 0, paid_count: 0, cancelled_count: 0,
  staff_hours: [], punches: [] };
async function setup(page, { role = "manager", archivedStatus = 200, authenticated = true } = {}) {
  const requests = [];
  await page.addInitScript(({ authenticated }) => {
    if (authenticated) localStorage.setItem("barticket_token", "EXPORT_TEST_TOKEN");
    localStorage.setItem("barticket_locale", "en");
  }, { authenticated });
  await page.route(origin + "/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,OPTIONS" } });
    requests.push({ path, method: request.method() });
    const values = {
      "/auth/me": { ...manager, role }, "/auth/status": { has_accounts: true, google_enabled: false },
      "/users": [{ ...manager, role }], "/users/recipients": [],
      "/shifts/current": null, "/shifts": [shift], "/analytics/shifts": [shift],
      "/tickets": [{ id: 50, name: "Cancelled", status: "cancelled", items: [], guest_count: 1,
        cover_charge_per_person: 500, cover_charge_total: 500, total: 500, created_at: 1792240100,
        paid_at: null, cancelled_at: 1792240200, created_by: "Manager", shift_id: 3, payment: null, payments: [] }],
      "/menu": { coverCharge: 500, items: [{ id: 1, name: "Highball", category: "Whisky", prices: { standard: 700 }, inStock: true }] },
      "/menu/archived": { items: [{ id: 2, name: "Archived beer", category: "Beer", prices: { standard: 800 }, inStock: false }] },
      "/notices": { business_date: null, status: null, notices: [] },
    };
    await route.fulfill({ status: path === "/menu/archived" ? archivedStatus : path in values ? 200 : 404,
      contentType: "application/json", body: JSON.stringify(values[path] ?? {}) });
  });
  return requests;
}
async function download(page, label) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: label, exact: true }).click();
  const file = await event;
  const data = JSON.parse(await readFile(await file.path(), "utf8"));
  return { file, data };
}

test("All Time downloads raw JSON including cancelled tickets; other tabs hide the control", async ({ page }) => {
  const requests = await setup(page);
  await page.goto("/analytics");
  await expect(page.getByRole("button", { name: "Download all data (JSON)", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "All time", exact: true }).click();
  const { file, data } = await download(page, "Download all data (JSON)");
  expect(file.suggestedFilename()).toMatch(/^barticket-all-time-.*\.json$/);
  expect(data.all_requested_sources_exported).toBe(true);
  expect(data.database_backup).toBe(false);
  expect(data.data.tickets[0].status).toBe("cancelled");
  expect(data.data.shifts[0].id).toBe(3);
  expect(JSON.stringify(data)).not.toContain("EXPORT_TEST_TOKEN");
  expect(requests.every(x => x.method === "GET")).toBe(true);
});

test("Menu downloads active and archived items regardless of search; Admin downloads team and shifts", async ({ page }) => {
  const requests = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/menu");
  const menu = await download(page, "Download menu data (JSON)");
  expect(menu.data.scope).toBe("menu");
  expect(menu.data.data.menu.items[0].id).toBe(1);
  expect(menu.data.data.archived_menu.items[0].id).toBe(2);
  expect(menu.data.data.tickets).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/barticket-menu-export-mobile.png" });
  await page.goto("/admin");
  const admin = await download(page, "Download admin data (JSON)");
  expect(admin.data.scope).toBe("admin");
  expect(admin.data.data.users[0].id).toBe(7);
  expect(admin.data.data.shifts[0].id).toBe(3);
  expect(requests.every(x => x.method === "GET")).toBe(true);
});

test("failed sources produce an explicitly partial download and visible warning", async ({ page }) => {
  await setup(page, { archivedStatus: 404 });
  await page.goto("/menu");
  const { data, file } = await download(page, "Download menu data (JSON)");
  expect(file.suggestedFilename()).toContain("-partial.json");
  expect(data.all_requested_sources_exported).toBe(false);
  expect(data.sources.find(x => x.key === "archived_menu").http_status).toBe(404);
  await expect(page.getByText("Partial export downloaded.", { exact: false })).toBeVisible();
});

test("staff cannot export admin or all-time team data", async ({ page }) => {
  await setup(page, { role: "staff" });
  await page.goto("/analytics");
  await page.getByRole("button", { name: "All time", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download all data (JSON)", exact: true })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: "Download admin data (JSON)", exact: true })).toHaveCount(0);
});


test("signed-out visitors cannot download menu data", async ({ page }) => {
  await setup(page, { authenticated: false });
  await page.goto("/menu");
  await expect(page.getByRole("heading", { name: "Drink Menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download menu data (JSON)", exact: true })).toHaveCount(0);
});
