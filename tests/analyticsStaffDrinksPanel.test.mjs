import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const analytics = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");
const report = readFileSync(new URL("../src/pages/analyticsTextReport.ts", import.meta.url), "utf8");

test("Analytics does not render a Staff Drinks panel in any range", () => {
  assert.doesNotMatch(analytics, /StaffDrinksReport|StaffDrinkPanel/);
});

test("text reports still retain recorded staff drinks", () => {
  assert.match(analytics, /staffShifts,/);
  assert.match(report, /shift\.staff_drinks/);
});
