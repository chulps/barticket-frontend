import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/analyticsTextReport.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { createAnalyticsTextReport } = await import("data:text/javascript," + encodeURIComponent(outputText));

function shift(id, date, overrides = {}) {
    return {
        id, business_date: date, status: "closed", opened_at: 1791700000, closed_at: 1791730000,
        opened_by: "Chuck", closed_by: "Chuck", paid_total: 10000, cash_total: 6000,
        card_total: 4000, other_total: 0, cover_total: 1000, guest_count: 10,
        paid_count: 5, cancelled_count: 1, staff_hours: [
            { user_id: 1, name: "Chuck", seconds: 14400 },
        ],
        punches: [], stockouts: [], staff_drinks: [], ...overrides,
    };
}
function totals(rows) {
    return {
        nights: rows.length,
        revenue: rows.reduce((sum, s) => sum + s.paid_total, 0),
        cash: rows.reduce((sum, s) => sum + s.cash_total, 0),
        card: rows.reduce((sum, s) => sum + s.card_total, 0),
        other: rows.reduce((sum, s) => sum + s.other_total, 0),
        unknownPayment: 0, missingTicketNights: 0,
        cover: rows.reduce((sum, s) => sum + s.cover_total, 0),
        guests: rows.reduce((sum, s) => sum + s.guest_count, 0),
        paid: rows.reduce((sum, s) => sum + s.paid_count, 0),
        cancelled: rows.reduce((sum, s) => sum + s.cancelled_count, 0),
        seconds: rows.reduce((sum, s) => sum + s.staff_hours.reduce((acc, p) => acc + p.seconds, 0), 0),
    };
}
function report(range, rows, extra = {}) {
    return createAnalyticsTextReport({
        range, label: "Selected Period", locale: "en", shifts: rows,
        totals: totals(rows), tickets: [], staffShifts: rows, team: null, notices: null,
        updatedAt: null, topItems: [{ name: "Whisky", quantity: 3, revenue: 2400 }], ...extra,
    });
}

test("All Time reports each year and does not mix up closed-shift totals", () => {
    const rows = [shift(1, "2025-12-31"), shift(2, "2026-01-01", { paid_total: 20000, guest_count: 15 })];
    const text = report("all", rows);
    assert.match(text, /Closed shifts only/);
    assert.match(text, /Revenue: ¥30,000/);
    assert.match(text, /Guests: 25/);
    assert.match(text, /2025 · ¥10,000 · 10 guests/);
    assert.match(text, /2026 · ¥20,000 · 15 guests/);
    assert.match(text, /Whisky · 3 units/);
});

test("Year and Month reports use the period currently selected", () => {
    const rows = [shift(10, "2026-09-15"), shift(12, "2026-09-15"), shift(13, "2026-10-03")];
    assert.match(report("year", rows), /2026-09 · ¥20,000 · 20 guests/);
    const monthly = report("month", rows.slice(0, 2));
    assert.match(monthly, /2026-09-15 \(#10\) · ¥10,000/);
    assert.match(monthly, /2026-09-15 \(#12\) · ¥10,000/);
    assert.doesNotMatch(monthly, /2026-10-03/);
});

test("Closed daily report includes manager, payments, and historic stockouts", () => {
    const row = shift(2, "2026-10-10", { stockouts: [{ item: "Nikka Days", by: "Chuck", at: 1 }] });
    const text = report("day", [row]);
    assert.match(text, /Manager: Chuck/);
    assert.match(text, /Cash: ¥6,000/);
    assert.match(text, /Nikka Days/);
    assert.match(text, /Staff hours/);
});

test("Live daily snapshot shows only paid totals and current shift activity", () => {
    const row = shift(99, "2026-10-12", {
        status: "open", paid_count: 1, cancelled_count: 0, paid_total: 7000,
        guest_count: 2, punches: [{ user_id: 1, name: "Chuck", clock_out: null }],
    });
    const text = report("day", [row], {
        tickets: [
            { shiftId: 99, status: "open", name: "Private customer", items: [] },
            { shiftId: 99, status: "paid", items: [] },
        ],
        team: [{ id: 1, name: "Chuck", role: "manager" }],
        notices: { business_date: "2026-10-12", status: "open", notices: [{ id: 1, item: "Yamazaki" }] },
        updatedAt: 1791800000,
    });
    assert.match(text, /SHIFT IN PROGRESS/);
    assert.match(text, /Revenue: ¥7,000/);
    assert.match(text, /Open tickets: 1/);
    assert.match(text, /Managers: Chuck/);
    assert.match(text, /Yamazaki/);
    assert.match(text, /Unpaid tickets are excluded/);
    assert.doesNotMatch(text, /Private customer/);
});

test("Japanese report and missing historical payment breakdown are labeled clearly", () => {
    const row = shift(3, "2026-03-01", { cash_total: 0, card_total: 0 });
    const text = report("month", [row], {
        locale: "ja",
        totals: { ...totals([row]), cash: 0, card: 0, unknownPayment: 10000, missingTicketNights: 1 },
    });
    assert.match(text, /分析レポート/);
    assert.match(text, /支払方法未記録: ¥10,000/);
    assert.match(text, /現金: —/);
    assert.match(text, /チケット件数未記録のシフト: 1/);
});

test("no shift data produces no shareable report", () => {
    assert.equal(report("year", []), "");
});

test("report preview and LINE sharing keep explicit user confirmation", () => {
    const actions = readFileSync(new URL("../src/components/AnalyticsReportActions.tsx", import.meta.url), "utf8");
    const analytics = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");
    for (const [file, sourceText] of [["AnalyticsReportActions.tsx", actions], ["Analytics.tsx", analytics]]) {
        assert.equal(ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.length, 0);
    }
    assert.match(actions, /line\.me\/R\/share\?text=/);
    assert.match(actions, /encodeURIComponent\(text\)/);
    assert.match(actions, /navigator\.clipboard/);
    assert.match(actions, /target="_blank"/);
    assert.match(actions, /expanded && text/);
    assert.match(analytics, /createAnalyticsTextReport\(/);
    assert.match(analytics, /<AnalyticsReportActions/);
});
