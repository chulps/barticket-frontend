import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("creator label is capped at seven characters including ellipsis", () => {
  const source = read("../src/utils/creatorDisplayName.ts");
  assert.match(source, /maxLength = 7/);
  assert.match(source, /characters\.slice\(0, maxLength - 1\)/);
  assert.match(source, /\+ "…"/);
});

test("active shift and ticket list use shortened labels while retaining original name", () => {
  const shift = read("../src/pages/OpenShiftOverview.tsx");
  const ticket = read("../src/components/TicketListItem.tsx");
  assert.match(shift, /title=\{shift\.opened_by\}>\{creatorDisplayName\(shift\.opened_by\)\}/);
  assert.match(ticket, /title=\{createdBy \?\? undefined\}/);
  assert.match(ticket, /t\("byName", \{ name: creatorDisplayName\(createdBy\) \}\)/);
});
