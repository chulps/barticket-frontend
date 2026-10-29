import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const source = readFileSync(new URL("../src/pages/chuckProfileAccess.ts", import.meta.url), "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 });
const context = { exports: {}, require: () => ({}) };
vm.runInNewContext(compiled, context);
const canViewChuckPersonalPay = context.exports.canViewChuckPersonalPay;
const config = { chuckUserId: 10, noriUserId: 20 };

test("Chuck's Profile pay is visible only to Chuck, while team review stays elsewhere", () => {
    assert.equal(canViewChuckPersonalPay({ id: 10, role: "manager" }, 10, config), true);
    assert.equal(canViewChuckPersonalPay({ id: 20, role: "manager" }, 10, config), false);
    assert.equal(canViewChuckPersonalPay({ id: 10, role: "manager" }, 20, config), false);
    assert.equal(canViewChuckPersonalPay({ id: 30, role: "staff" }, 10, config), false);
    assert.equal(canViewChuckPersonalPay({ id: 10, role: "manager" }, 10, { ...config, noriUserId: 10 }), false);
});
