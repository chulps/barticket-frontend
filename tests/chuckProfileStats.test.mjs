import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/chuckProfileStats.ts", import.meta.url), "utf8");
const helper = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { buildChuckProfileStats } = await import(`data:text/javascript;base64,${Buffer.from(helper).toString("base64")}`);

function shift(id, business_date, working_manager_user_id, guest_count = 0, status = "closed") {
    return { id, business_date, working_manager_user_id, guest_count, status };
}

test("Chuck stats use original billed sales on confirmed Chuck-managed dates", () => {
    const result = buildChuckProfileStats(
        [shift(1, "2026-10-01", 10, 7), shift(2, "2026-10-02", 11, 3), shift(3, "2026-09-30", 10, 4)],
        { items: [{ business_date: "2026-10-01", original_billed_total: 52000 }], basis: "original_service_business_date", label: "Billed" },
        10,
        "2026-10",
    );

    assert.deepEqual(result.nights, [{ businessDate: "2026-10-01", shiftId: 1, billedSalesYen: 52000, guests: 7 }]);
    assert.equal(result.unassignedManagerDays, 0);
    assert.equal(result.ambiguousManagerDays, 0);
});

test("unassigned and conflicting manager days do not get attributed to Chuck", () => {
    const result = buildChuckProfileStats(
        [shift(1, "2026-10-01", null), shift(2, "2026-10-02", 10), shift(3, "2026-10-02", 11)],
        { items: [], basis: "original_service_business_date", label: "Billed" },
        10,
        "2026-10",
    );

    assert.deepEqual(result.nights, []);
    assert.equal(result.unassignedManagerDays, 1);
    assert.equal(result.ambiguousManagerDays, 1);
});

test("open shifts and closure-only rows are excluded from monthly earned stats", () => {
    const result = buildChuckProfileStats(
        [shift(1, "2026-10-01", 10, 5, "open"), shift(null, "2026-10-02", null, 0, null)],
        { items: [], basis: "original_service_business_date", label: "Billed" },
        10,
        "2026-10",
    );

    assert.deepEqual(result.nights, []);
    assert.equal(result.unassignedManagerDays, 0);
});
test("missing ticket-level sales remain unavailable instead of becoming zero", () => {
    const result = buildChuckProfileStats(
        [shift(4, "2026-10-04", 10, 2)],
        { items: [], basis: "original_service_business_date", label: "Billed" },
        10,
        "2026-10",
    );

    assert.deepEqual(result.nights, [{
        businessDate: "2026-10-04",
        shiftId: 4,
        billedSalesYen: null,
        guests: 2,
    }]);
});
