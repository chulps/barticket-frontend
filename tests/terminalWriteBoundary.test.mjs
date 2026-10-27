import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const hook=readFileSync(new URL("../src/hooks/useTickets.ts",import.meta.url),"utf8");
const payment=readFileSync(new URL("../src/components/PaymentModal.tsx",import.meta.url),"utf8");
test("all nonterminal queued ticket writes are rejected once a terminal write starts",()=>{
  assert.match(hook,/if \(terminalPending\.current\.has\(ticketId\) && !terminalWrite\)/);
  assert.match(hook,/return Promise\.resolve\(null\)/);
  assert.match(hook,/if \(terminalPending\.current\.has\(ticketId\)\) return;/);
});
test("pay and cancel require an existing confirmed open ticket, reopen a closed ticket",()=>{
  assert.match(hook,/expected === "open" \? status !== "open"/);
  assert.match(hook,/status === undefined \|\| status === "open"/);
  assert.match(hook,/terminalMutation\(ticketId, "open"/);
  assert.match(hook,/terminalMutation\(ticketId, "closed"/);
});
test("rename is queued before terminal lock and terminal operations bypass only that lock",()=>{
  assert.match(hook,/flushRename\(ticketId\);\s*terminalPending\.current\.add\(ticketId\)/);
  assert.match(hook,/\.finally\(\(\) => terminalPending\.current\.delete\(ticketId\)\)/);
  assert.match(hook,/ticketsApi\.pay\(ticketId, paymentType, amount, idempotencyKey\), undefined, true/);
  assert.match(payment,/if \(pending\.current\) return/);
  assert.doesNotMatch(hook,/setInterval\(\(\) => ticketsApi\.pay/);
});
test("ticket hook still parses",()=>{
  const ast=ts.createSourceFile("useTickets.ts",hook,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  assert.deepEqual(ast.parseDiagnostics.map(d=>d.messageText),[]);
});
