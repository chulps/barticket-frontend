import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/pages/AdminPayDeductions.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/api/account.ts", import.meta.url), "utf8");

test("Admin can record a confirmed manager-pay deduction with source context", () => {
    assert.match(page, /value="manager_pay_deduction"/);
    assert.match(page, /manager confirms the amount reduces pay/);
    assert.match(page, /Preserve the original source column/);
    assert.match(page, /required=\{category === "manager_pay_deduction"\}/);
    assert.match(page, /categoryLabel\(item\.category, ja\)/);
    assert.match(account, /category: "language_exchange_commission" \| "manager_paid_staff_tip" \| "manager_pay_deduction"/);
});
