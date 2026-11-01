import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const profile = readFileSync(new URL("../src/pages/Profile.tsx",import.meta.url),"utf8");
test("Profile starts with Shift and keeps explicit pay/history/account URL destinations",()=>{
 const tabs=profile.match(/tabs=\{\[([\s\S]*?)\]\}/)?.[1];
 assert.deepEqual([...tabs.matchAll(/id: "([^"]+)"/g)].map(match=>match[1]),["shift","pay","history","account"]);
 assert.match(profile,/requestedView === "pay" \|\| requestedView === "history" \|\| requestedView === "account" \? requestedView : "shift"/);
 assert.match(profile,/if \(next === "shift"\) params.delete\("section"\)/);
 assert.match(profile,/else params.set\("section", next\)/);
 assert.match(profile,/new URLSearchParams\(previous\)/);
 assert.doesNotMatch(profile,/setView\("shift"\)/);
 assert.match(profile,/view === "pay" \? <StaffIncome key=\{account.id\}/);
});
