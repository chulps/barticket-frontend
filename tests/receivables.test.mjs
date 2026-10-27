import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = (name) => readFileSync(new URL("../src/" + name, import.meta.url), "utf8");

test("unpaid deferral requires a matching confirmed balance and explicit staff confirmation", () => {
    const modal = source("components/TicketDetails/DeferPaymentModal.tsx");
    assert.match(modal, /amount !== balance/);
    assert.match(modal, /checked=\{confirmed\}/);
    assert.match(modal, /confirmed_balance: amount/);
    assert.match(modal, /ticket\.serviceBusinessDate|service date/);
});

test("close preview permits only server-approved carry-forwards and still blocks active tickets", () => {
    const policy = source("pages/shiftControlPolicy.ts");
    const review = source("pages/ShiftCloseReview.tsx");
    assert.match(policy, /ticket\.status === "open" && \(ticket\.service_status \?\? "active"\) === "active"/);
    assert.match(review, /accountApi\.closeReadiness\(\)/);
    assert.match(review, /approved_carry_forwards/);
    assert.match(review, /ready\.can_close/);
    assert.match(review, /confirmClose\(\)/);
});

test("later collections are idempotent, partial, and visible across business dates", () => {
    const modal = source("components/PaymentModal.tsx");
    const api = source("api/tickets.ts");
    const page = source("pages/Receivables.tsx");
    assert.match(modal, /crypto\.randomUUID\(\)/);
    assert.match(modal, /Amount collected now|今回受け取る金額/);
    assert.match(api, /"Idempotency-Key"/);
    assert.match(page, /ticketsApi\.receivables/);
    assert.match(page, /service_business_date/);
    assert.match(page, /collection_business_date/);
});

test("write-offs and payment voids are manager-only, audited, and never represented as processor refunds", () => {
    const page = source("pages/Receivables.tsx");
    assert.match(page, /account\?\.role === "manager" && isUnresolved \? <WriteOffForm/);
    assert.match(page, /account\?\.role === "manager" && payment\.id/);
    assert.match(page, /does not refund a card payment|返金は行いません/);
    assert.match(page, /ticketsApi\.writeOff/);
    assert.match(page, /ticketsApi\.voidPayment/);
});

test("staff notes stay out of copy exports, and touched modules parse", () => {
    const exportSource = source("pages/ticketDataExport.ts");
    assert.doesNotMatch(exportSource, /unpaid_note|unpaidNote/);
    for (const file of [
        "App.tsx", "api/tickets.ts", "components/PaymentModal.tsx",
        "components/TicketDetails/DeferPaymentModal.tsx", "pages/Receivables.tsx",
        "pages/ShiftCloseReview.tsx", "pages/Dashboard.tsx",
    ]) {
        const tsx = file.endsWith(".tsx");
        const parsed = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        assert.deepEqual(parsed.parseDiagnostics.map(diagnostic => diagnostic.messageText), [], file);
    }
});
