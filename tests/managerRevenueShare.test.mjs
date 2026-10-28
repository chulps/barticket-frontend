import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const modelSource = readFileSync(new URL("../src/pages/managerRevenueShare.ts", import.meta.url), "utf8");
const accessSource = readFileSync(new URL("../src/pages/managerRevenueShareAccess.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/pages/AdminManagerShare.tsx", import.meta.url), "utf8");
const adminTeam = readFileSync(new URL("../src/pages/AdminTeam.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/pages/Admin.tsx", import.meta.url), "utf8");
const deployment = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
const transpile = source => ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: true,
    },
}).outputText;
const model = await import("data:text/javascript," + encodeURIComponent(transpile(modelSource)));
const access = await import("data:text/javascript," + encodeURIComponent(transpile(accessSource)));

test("only Chuck and Nori manager IDs can see the card, on Chuck's profile only", () => {
    const config = { chuckUserId: 17, noriUserId: 23 };
    const manager = id => ({ id, role: "manager" });
    assert.equal(access.canSeeChuckRevenueShare(manager(17), 17, config), true);
    assert.equal(access.canSeeChuckRevenueShare(manager(23), 17, config), true);
    assert.equal(access.canSeeChuckRevenueShare(manager(90), 17, config), false);
    assert.equal(access.canSeeChuckRevenueShare({ id: 17, role: "staff" }, 17, config), false);
    assert.equal(access.canSeeChuckRevenueShare(manager(17), 23, config), false);
    assert.equal(access.canSeeChuckRevenueShare(manager(23), 23, config), false);
    assert.equal(access.canSeeChuckRevenueShare(manager(17), 90, config), false);
    assert.equal(access.canSeeChuckRevenueShare(null, 17, config), false);
});

test("allowlist fails closed when either ID is missing, invalid or identical", () => {
    const chuck = { id: 17, role: "manager" };
    for (const bad of [
        { chuckUserId: null, noriUserId: 23 },
        { chuckUserId: 17, noriUserId: null },
        { chuckUserId: 17, noriUserId: 17 },
        { chuckUserId: 0, noriUserId: 23 },
    ]) {
        assert.equal(access.canSeeChuckRevenueShare(chuck, 17, bad), false);
    }
});

test("private card is only rendered after Admin role guard and identity gate", () => {
    assert.match(admin, /me\?\.role !== "manager"/);
    assert.match(admin, /viewer={me}/);
    assert.match(adminTeam, /canSeeChuckRevenueShare\(viewer, person\.id, revenueShareViewers\)/);
    assert.match(adminTeam, /<AdminManagerShare/);
    assert.match(accessSource, /subjectUserId === chuckUserId/);
    assert.match(accessSource, /viewer\.id === chuckUserId \|\| viewer\.id === noriUserId/);
    assert.doesNotMatch(accessSource, /viewer\.name|viewer\.email/);
    assert.match(deployment, /vars\.VITE_REVENUE_SHARE_CHUCK_USER_ID/);
    assert.match(deployment, /vars\.VITE_REVENUE_SHARE_NORI_USER_ID/);
    for (const source of [modelSource, accessSource]) {
        assert.doesNotMatch(source, /\bapiRequest\(|\bfetch\(|localStorage|sessionStorage|axios|accountApi\./);
    }
    assert.match(ui, /accountApi\.assignWorkingManager\(/);
    assert.match(ui, /revenueSharePreview\(selectedMonth\)/);
    assert.match(ui, /accountApi\.workingManagerHistory\(/);
    assert.match(adminTeam, /refreshVersion=\{refreshKey\}/);
    assert.match(readFileSync(new URL("../src/api/account.ts", import.meta.url), "utf8"), /gross_share_yen: number \| null/);
    assert.match(readFileSync(new URL("../src/api/account.ts", import.meta.url), "utf8"), /payable_yen/);
    assert.match(ui, /working_manager_user_id/);
});

test("default tier boundaries and confirmed 60 percent ceiling", () => {
    const cases = [
        [0, 40], [499999, 40], [500000, 41], [549999, 41],
        [550000, 42], [599999, 42], [600000, 43], [749999, 45],
        [750000, 46], [999999, 50], [1000000, 51], [1049999, 51],
        [1050000, 52], [1099999, 52], [1100000, 53],
        [1399999, 58], [1400000, 59], [1449999, 59],
        [1450000, 60], [1499999, 60], [2000000, 60],
    ];
    for (const [revenue, percent] of cases) {
        assert.equal(model.eligibleTierRate(revenue), percent, "eligible revenue " + revenue);
    }
    for (const n of [-1, NaN, Infinity, 500000.5]) assert.equal(model.eligibleTierRate(n), null);
    assert.deepEqual(model.nextTier(499999), { rate: 41, atYen: 500000, remainingYen: 1 });
    assert.deepEqual(model.nextTier(1000000), { rate: 52, atYen: 1050000, remainingYen: 50000 });
    assert.deepEqual(model.nextTier(1449999), { rate: 60, atYen: 1450000, remainingYen: 1 });
    assert.equal(model.nextTier(1450000), null);
    assert.deepEqual(model.shareBrackets().at(-1), { from: 1450000, to: null, rate: 60 });
});

test("confirmed flat tiers apply to all qualifying monthly sales while unresolved data blocks pay", () => {
    assert.equal(model.eligibleTierRate(0), 40);
    assert.equal(model.eligibleTierRate(500000), 41);
    assert.equal(model.eligibleTierRate(1450000), 60);
    assert.match(ui, /the reached monthly rate applies to all qualifying monthly sales/i);
    assert.match(ui, /unpaid tickets count in the service month/i);
    assert.match(ui, /rounding/i);
    assert.match(ui, /gross share \(sales basis pending\)/i);
    assert.doesNotMatch(ui, /setPolicyDraft|marginal\/tranche example/i);
});

const shifts = [
    { id: 5, business_date: "2026-10-01", status: "closed", paid_total: 300000, opened_by: "Person A" },
    { id: 6, business_date: "2026-10-02", status: "closed", paid_total: 300000, opened_by: "Person B" },
    { id: 7, business_date: "2026-11-01", status: "closed", paid_total: 999999, opened_by: "Person A" },
];

test("month list and shift snapshots use API business dates and deduplicate open shifts", () => {
    assert.deepEqual(model.shareMonths(shifts), ["2026-11", "2026-10"]);
    const unique = model.distinctShareShifts([
        shifts[0], { ...shifts[0], status: "open", paid_total: 310000 }, shifts[1],
    ]);
    assert.equal(unique.length, 2);
    assert.equal(unique.find(x => x.id === 5).paid_total, 310000);
});

test("new frontend TS/TSX parses without errors", () => {
    for (const [filename, source, kind] of [
        ["AdminManagerShare.tsx", ui, ts.ScriptKind.TSX],
        ["managerRevenueShare.ts", modelSource, ts.ScriptKind.TS],
        ["managerRevenueShareAccess.ts", accessSource, ts.ScriptKind.TS],
    ]) {
        const result = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, kind);
        assert.deepEqual(result.parseDiagnostics.map(x => x.messageText), [], filename);
    }
});
