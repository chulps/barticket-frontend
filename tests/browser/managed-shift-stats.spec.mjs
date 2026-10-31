import { test, expect } from "@playwright/test";
for (const locale of ["en", "ja"]) for (const width of [320, 1280]) {
    test("personal weekday averages are accessible and cached " + locale + width, async ({ page }) => {
        await page.setViewportSize({ width, height: 1100 });
        const requests = [];
        await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
        await page.route("**/profile/managed-shift-stats?*", async route => {
            const url = new URL(route.request().url()), period = url.searchParams.get("period");
            requests.push(period);
            await route.fulfill({ json: {
                user_id: 901, month: "2026-10", period, basis: "original_service_business_date",
                date_from: null, date_to: null,
                weekdays: Array.from({ length: 7 }, (_, weekday) => ({
                    weekday, shift_count: weekday === 0 ? 0 : 2,
                    sales_total_yen: weekday === 0 ? 0 : weekday === 3 ? -20 : 200,
                    average_sales_yen: weekday === 0 ? null : weekday === 3 ? -10 : 100,
                })),
                nights: period === "month" ? [{ business_date: "2026-10-01", shift_id: 1, sales_yen: -10, guests: 3, sales_source: "tickets" }] : [],
                summary_shift_count: 12, summary_sales_yen: 980, summary_guests: 30,
                excluded_open_shift_count: 1, excluded_incomplete_shift_count: 2, excluded_ambiguous_day_count: 1,
            } });
        });
        await page.route("**/weekday-stats-fixture", route => route.fulfill({ contentType: "text/html", body: `<html><meta charset="utf-8"><div id="root"></div><script type="module">
            import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
            import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
            localStorage.setItem('barticket_token','fixture-only');
            const {default:Stats}=await import('/src/pages/ManagedShiftStats.tsx');import '/src/index.css';
            ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('div',{style:{maxWidth:'850px',margin:'8px'}},React.createElement(Stats,{userId:901,month:'2026-10',locale:'${locale}',active:true})));
        </script></html>` }));
        await page.goto("/weekday-stats-fixture");
        const list = page.getByRole("list", { name: locale === "en" ? "Weekday averages and shift counts" : "曜日別の平均売上とシフト数" });
        await expect(list.locator("li")).toHaveCount(7);
        await expect(list).toContainText(locale === "en" ? "No data" : "データなし");
        await expect(page.getByText(locale === "en" ? /Tied highest average/ : /最高平均（同率）/)).toBeVisible();
        expect(requests).toEqual(["month"]);
        await page.getByRole("combobox").selectOption("year");
        await expect.poll(() => requests).toEqual(["month", "year"]);
        await page.getByRole("combobox").selectOption("all_time");
        await expect.poll(() => requests).toEqual(["month", "year", "all_time"]);
        await page.getByRole("combobox").selectOption("month");
        await expect(list.locator("li")).toHaveCount(7);
        expect(requests).toEqual(["month", "year", "all_time"]);
        const labels = await list.innerText();
        expect(labels).toContain(locale === "en" ? "Thu" : "木");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const widths = await list.locator("b").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
        expect(widths[0]).toBe(0);
        expect(widths[3]).toBeGreaterThan(0);
        await page.getByRole("button", { name: locale === "en" ? "Refresh stats" : "再読み込み" }).click();
        await expect.poll(() => requests.length).toBe(4);
    });
}
