import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/TicketDetails/TicketActions.tsx", import.meta.url), "utf8");

test("cancel button opens a confirmation instead of cancelling immediately", () => {
    assert.match(source, /onClick=\{confirmCancellation\}/);
    assert.match(source, /openModal\(\{/);
    assert.match(source, /Are you sure you want to cancel this ticket\?/);
    assert.match(source, /本当にこのチケットをキャンセルしますか？/);
});

test("No closes the dialog; only Yes invokes cancellation", () => {
    assert.match(source, /className="hollow secondary" onClick=\{closeModal\} autoFocus/);
    assert.match(source, /onClick=\{\(\) => \{ closeModal\(\); onCancelTicket\(ticket\.id\); \}\}/);
    assert.equal((source.match(/onCancelTicket\(ticket\.id\)/g) ?? []).length, 1);
});
