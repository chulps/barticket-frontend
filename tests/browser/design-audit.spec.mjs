import { test, expect } from "@playwright/test";

// Isolated synthetic identities only. No production requests or credentials.
const manager = { id: 901, name: "Fixture Manager", email: "manager@example.invalid", role: "manager", has_password: true, google_connected: false };
const staff = { id: 903, name: "A long fixture staff name for narrow-screen wrapping", email: "staff@example.invalid", role: "staff" };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
async function isolate(page, locale, token = null) {
  await page.addInitScript(({ locale, token }) => {
    localStorage.clear();
    localStorage.setItem("barticket_locale", locale);
    if (token) localStorage.setItem("barticket_token", token);
  }, { locale, token });
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
}

async function expectReadable(locator) {
  const rows = await locator.evaluateAll(nodes => nodes.filter(el => el.getClientRects().length && !el.matches(":disabled")).map(el => {
    const rgba = value => value.match(/[\d.]+/g).map(Number);
    const blend = (front, back) => front.slice(0, 3).map((v, i) => v * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
    const ancestors = []; for (let node = el; node; node = node.parentElement) ancestors.push(node);
    let background = [255, 255, 255];
    for (const node of ancestors.reverse()) background = blend(rgba(getComputedStyle(node).backgroundColor), background);
    const style = getComputedStyle(el), foreground = blend(rgba(style.color), background);
    const luminance = values => values.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(foreground), b = luminance(background);
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.6667 && parseInt(style.fontWeight, 10) >= 700);
    return { text: el.textContent.trim().slice(0, 90), contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), minimum: large ? 3 : 4.5 };
  }));
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.contrast, row.text).toBeGreaterThanOrEqual(row.minimum);
}
async function setTheme(page, light) {
  await page.evaluate(light => document.documentElement.classList.toggle("light", light), light);
  await expect(page.locator("body")).toHaveCSS("background-color", light ? "rgb(255, 255, 255)" : "rgb(27, 29, 33)");
}
async function expectFits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function mockAuth(page, locale, hasAccounts) {
  await isolate(page, locale);
  const state = { writes: [], pending: null, fail: true };
  await page.route("http://127.0.0.1:8765/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    let status = 200, data = [];
    if (request.method() === "POST" && ["/auth/login", "/auth/register"].includes(path)) {
      state.writes.push({ path, body: request.postDataJSON() });
      await new Promise(resolve => { state.pending = resolve; });
      status = state.fail ? 401 : 200;
      data = state.fail ? { detail: locale === "ja" ? "認証できませんでした（テスト）" : "Fixture authentication failed" } : { token: "ISOLATED_AUDIT_SESSION", user: manager };
    } else if (request.method() !== "GET") { status = 405; data = { detail: "Unexpected fixture write" }; }
    else if (path === "/auth/status") data = { has_accounts: hasAccounts, google_enabled: false };
    else if (path === "/auth/me") data = manager;
    else if (path === "/shifts/current") data = null;
    else if (path === "/menu") data = { items: [], coverCharge: 500 };
    else if (path === "/notices") data = { notices: [] };
    await route.fulfill({ status, json: data, headers: cors });
  });
  return state;
}

for (const locale of ["en", "ja"]) for (const width of [320, 390, 1280]) {
  for (const hasAccounts of [true, false]) test(`native auth ${hasAccounts ? "login" : "registration"} ${locale} ${width}`, async ({ page }, testInfo) => {
    const state = await mockAuth(page, locale, hasAccounts);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const form = page.locator("form").filter({ has: page.locator('input[type="password"]') });
    await expect(form).toHaveCount(1);
    const email = form.locator('input[name="email"]'), password = form.locator('input[name="password"]');
    const submit = form.locator('button[type="submit"]');
    await expect(email).toHaveAttribute("type", "email");
    await expect(email).toHaveAttribute("autocomplete", hasAccounts ? "username" : "email");
    await expect(password).toHaveAttribute("autocomplete", hasAccounts ? "current-password" : "new-password");
    await expect(email).toHaveAttribute("required", "");
    await expect(password).toHaveAttribute("required", "");
    if (!hasAccounts) {
      const name = form.locator('input[name="name"]');
      await expect(name).toHaveAttribute("autocomplete", "name");
      await expect(name).toHaveAttribute("required", "");
      await name.fill("Synthetic New Manager");
    }
    await submit.click();
    expect(state.writes).toHaveLength(0);
    await email.fill("not-an-email"); await password.fill("synthetic fixture password");
    await password.press("Enter");
    expect(state.writes).toHaveLength(0);
    await email.fill("synthetic@example.invalid");
    for (const light of [false, true]) {
      await setTheme(page, light);
      await page.mouse.move(0, 0);
      await expectReadable(form.locator("h2, label, button[type=submit]"));
      await submit.hover();
      await expectReadable(submit);
      await expectFits(page);
      await page.screenshot({ path: testInfo.outputPath(`audit-auth-${light ? "light" : "dark"}.png`), fullPage: true });
    }
    await password.focus(); await expect(password).toBeFocused();
    await password.press("Enter");
    await expect.poll(() => state.writes.length).toBe(1);
    await expect(submit).toBeDisabled();
    await password.press("Enter");
    // Native disabled activation and repeated Enter must not issue another request.
    await submit.evaluate(button => button.click());
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].path).toBe(hasAccounts ? "/auth/login" : "/auth/register");
    expect(state.writes[0].body.email).toBe("synthetic@example.invalid");
    state.pending();
    await expect(page.getByRole("alert")).toContainText(locale === "ja" ? "認証できませんでした" : "Fixture authentication failed");
    await expect(submit).toBeEnabled();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => localStorage.getItem("barticket_token"))).toBeNull();
    // Pointer retry is the same single-submit path; success navigates once.
    state.fail = false;
    await submit.click();
    await expect.poll(() => state.writes.length).toBe(2);
    await expect(submit).toBeDisabled();
    state.pending();
    await expect(page).toHaveURL(/\/tickets$/);
    expect(state.writes).toHaveLength(2);
  });

  test(`Admin semantic contrast ${locale} ${width}`, async ({ page }, testInfo) => {
    await isolate(page, locale, "ISOLATED_AUDIT_ADMIN");
    const writes = [];
    await page.route("http://127.0.0.1:8765/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      let status = 200, data = [];
      if (request.method() !== "GET") { writes.push(path); status = 405; }
      else if (path === "/auth/me") data = manager;
      else if (path === "/users") data = [manager, staff];
      else if (path === "/auth/status") data = { has_accounts: true, google_enabled: false };
      else if (path === "/admin/payment-setup/access") data = { can_configure: true };
      else if (path === "/shifts/current") data = null;
      else if (path === "/menu") data = { items: [], coverCharge: 500 };
      else if (path === "/notices") data = { notices: [] };
      await route.fulfill({ status, json: data, headers: cors });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin?section=accounts");
    const form = page.locator("form").filter({ has: page.locator('input[type="email"]') });
    await expect(form).toBeVisible();
    await expect(page.getByText(staff.name, { exact: true })).toBeVisible();
    const cards = page.locator("section").filter({ has: page.locator("h2") });
    for (const light of [false, true]) {
      await setTheme(page, light);
      await page.mouse.move(0, 0);
      await expectReadable(cards.locator("h2, p, strong, label, span"));
      await expectReadable(form.locator("button[type=submit]"));
      await form.locator("button[type=submit]").hover();
      await expectReadable(form.locator("button[type=submit]"));
      await expectFits(page);
      await page.screenshot({ path: testInfo.outputPath(`audit-admin-${light ? "light" : "dark"}.png`), fullPage: true });
    }
    expect(writes).toEqual([]);
  });

  for (const surface of ["menu", "profile"]) test(`real ${surface} RequestState recovery ${locale} ${width}`, async ({ page }, testInfo) => {
    await isolate(page, locale, surface === "profile" ? "ISOLATED_FAILED_LOOKUP" : null);
    const state = { reads: 0, writes: [] };
    const target = surface === "menu" ? "/menu" : "/auth/me";
    await page.route("http://127.0.0.1:8765/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      let status = 200, data = [];
      if (request.method() !== "GET") { state.writes.push(path); status = 405; }
      else if (path === target) {
        state.reads++; status = 503;
        data = { detail: locale === "ja" ? "アカウント情報を読み込めませんでした。接続が復旧した後に最新の状態を確認してください（テスト）。" : "Fixture account lookup unavailable. Check the latest account state after connectivity returns before attempting another action." };
      }
      else if (path === "/auth/status") data = { has_accounts: true, google_enabled: false };
      else if (path === "/shifts/current") data = null;
      else if (path === "/menu") data = { items: [], coverCharge: 500 };
      else if (path === "/notices") data = { notices: [] };
      await route.fulfill({ status, json: data, headers: cors });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${surface}`);
    const retry = page.getByRole("button", { name: locale === "ja" ? "状態を再確認" : "Refresh status", exact: true });
    const notice = page.getByRole("alert").filter({ has: retry });
    await expect(notice).toBeVisible();
    if (surface === "profile") await expect(page.locator("form")).toHaveCount(0);
    for (const light of [false, true]) {
      await setTheme(page, light);
      await expect(notice).toHaveCSS("padding-top", "18px");
      await expect(notice).toHaveCSS("border-top-width", "1px");
      await expectReadable(notice.locator("span"));
      await retry.scrollIntoViewIfNeeded(); await retry.focus(); await expect(retry).toBeFocused();
      const box = await retry.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await expectFits(page);
      await page.screenshot({ path: testInfo.outputPath(`audit-${surface}-error-${light ? "light" : "dark"}.png`), fullPage: true });
    }
    const before = state.reads;
    await retry.press("Enter");
    await expect.poll(() => state.reads).toBeGreaterThan(before);
    await expect(notice).toBeVisible();
    expect(state.writes).toEqual([]);
    if (surface === "profile") await expect(page.locator("form")).toHaveCount(0);
  });

  test(`RequestState computed presentation ${locale} ${width}`, async ({ page }) => {
    await isolate(page, locale);
    await page.route("**/audit-request-state-fixture", route => route.fulfill({ contentType: "text/html", body: `<html><div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default:RequestState} = await import('/src/components/RequestState.tsx');
      import '/src/index.css';
      window.auditRetries = 0;
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('main', {style:{padding:'8px'}},
        ...['loading','empty','forbidden','offline','error','failed-save'].flatMap(kind => [false,true].map(compact =>
          React.createElement('section', {key:kind+compact,'data-kind':kind,'data-compact':String(compact)},
            React.createElement(RequestState,{kind,compact,onRetry:()=>window.auditRetries++}))))));
    </script></html>` }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/audit-request-state-fixture");
    await expect(page.locator("main section")).toHaveCount(12);
    for (const light of [false, true]) {
      await setTheme(page, light);
      for (const kind of ["loading", "empty", "forbidden", "offline", "error", "failed-save"]) for (const compact of [false, true]) {
        const warning = !["loading", "empty"].includes(kind);
        const wrapper = page.locator(`section[data-kind="${kind}"][data-compact="${compact}"]`);
        const notice = wrapper.getByRole(warning ? "alert" : "status");
        await expect(notice).toHaveCSS("padding-top", compact ? "9px" : "18px");
        await expect(notice).toHaveCSS("padding-right", compact ? "9px" : "18px");
        await expect(notice).toHaveCSS("border-top-width", "1px");
        await expect(notice).toHaveCSS("border-top-style", "solid");
        const expectedBorder = await notice.evaluate((node, token) => {
          const probe = document.createElement("span"); probe.style.color = `var(${token})`; node.append(probe);
          const color = getComputedStyle(probe).color; probe.remove(); return color;
        }, warning ? "--danger-500" : "--neutral-700");
        await expect(notice).toHaveCSS("border-top-color", expectedBorder);
        await expect(notice).toHaveAttribute("aria-live", warning ? "assertive" : "polite");
        await expect(notice).toHaveAttribute("aria-busy", String(kind === "loading"));
        await expectReadable(notice.locator("span"));
        if (kind === "loading") await expect(notice.getByRole("button")).toHaveCount(0);
        else {
          const retry = notice.getByRole("button", { name: locale === "ja" ? "状態を再確認" : "Refresh status" });
          await expect(retry).toBeVisible(); await expect(retry).toHaveCSS("min-height", "44px");
        }
      }
      await expectFits(page);
    }
    await page.locator('section[data-kind="error"][data-compact="true"]').getByRole("button").click();
    expect(await page.evaluate(() => window.auditRetries)).toBe(1);
  });
}
