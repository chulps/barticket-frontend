import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (name) => readFileSync(new URL("../src/" + name, import.meta.url), "utf8");

test("payment dialog waits for API confirmation before reporting success", () => {
  const modal = source("components/PaymentModal.tsx");
  const start = modal.indexOf("const handleConfirm");
  const finish = modal.indexOf("if (step ===", start);
  const handler = modal.slice(start, finish);
  assert.match(handler, /if \(pending\.current\) return/);
  assert.match(handler, /await onConfirm\(paymentType, numericAmount, idempotencyKey\.current\)/);
  assert.match(handler, /if \(confirmed\) setStep\("success"\)/);
  assert.match(modal, /disabled=\{saving \|\| !Number\.isSafeInteger\(numericAmount\)/);
  assert.match(modal, /role="alert"/);
});

test("terminal operations reject simultaneous duplicate calls on the same ticket", () => {
  const hook = source("hooks/useTickets.ts");
  assert.match(hook, /terminalPending\.current\.has\(ticketId\)/);
  assert.match(hook, /terminalPending\.current\.add\(ticketId\)/);
  assert.match(hook, /\.finally\(\(\) => terminalPending\.current\.delete\(ticketId\)\)/);
  for (const op of ["cancelTicket", "payTicket", "reopenTicket"]) {
    assert.match(hook, new RegExp("const " + op + "[\\s\\S]*?terminalMutation\\(ticketId"));
  }
});

test("payment result propagates from API through ticket footer", () => {
  const dashboard = source("pages/Dashboard.tsx");
  const ticket = source("components/TicketDetails/Ticket.tsx");
  const actions = source("components/TicketDetails/TicketActions.tsx");
  assert.match(dashboard, /if \(!\(await payTicket\(ticketId, paymentType, amount, idempotencyKey\)\)\) return false/);
  assert.match(dashboard, /const partialReceivable = current\?\.serviceStatus === "completed"/);
  assert.match(ticket, /return onPayTicket\(id, method, amount, key\)/);
  assert.match(actions, /onConfirm=\{\(paymentType, amount, key\)\s*=>\s*onPayTicket\(ticket\.id, paymentType, amount, key\)/);
});
