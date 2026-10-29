import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const component = readFileSync(new URL("../src/pages/AdminTeamEditors.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/api/account.ts", import.meta.url), "utf8");
const helperSource = readFileSync(new URL("../src/pages/adminPunchCorrections.ts", import.meta.url), "utf8");

function loadHelper() {
    const js = ts.transpileModule(helperSource, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(js, { module, exports: module.exports });
    return module.exports;
}

test("manager punch correction UI calls the audited API after explicit confirmation", () => {
    assert.match(component, /accountApi\.correctPunch\(shiftId, punch\.id/);
    assert.match(component, /window\.confirm/);
    assert.match(component, /correction_history/);
    assert.match(component, /type="datetime-local" step="1"/);
    assert.match(component, /Original recorded timestamps remain intact/);
    assert.match(api, /\/shifts\/\$\{shiftId\}\/punches\/\$\{punchId\}\/corrections/);
});

test("clock correction inputs preserve Japan time and reject invalid or future ranges", () => {
    const { unixSecondsToJstInput, jstInputToIso, validPunchCorrection } = loadHelper();
    const input = unixSecondsToJstInput(Date.parse("2026-10-01T12:00:00Z") / 1000);
    assert.equal(input, "2026-10-01T21:00:00");
    assert.equal(jstInputToIso(input), "2026-10-01T21:00:00+09:00");
    assert.equal(jstInputToIso("2026-02-30T21:00:00"), null);
    assert.equal(validPunchCorrection("2026-10-01T21:00:00", "2026-10-01T20:59:00", Date.parse("2026-10-02T00:00:00Z")), false);
    assert.equal(validPunchCorrection("2026-10-01T21:00:00", "2026-10-02T09:00:00", Date.parse("2026-10-02T00:00:00Z")), false);
    assert.equal(validPunchCorrection("2026-10-01T21:00:00", "2026-10-01T22:00:00", Date.parse("2026-10-02T00:00:00Z")), true);
});

test("staff profile activity retains punch identifiers for the selected employee", () => {
    const source = readFileSync(new URL("../src/pages/staffProfileData.ts", import.meta.url), "utf8");
    assert.match(source, /punches:\s*ShiftPunch\[\]/);
    assert.match(source, /punches,\s*drinks/);
});
