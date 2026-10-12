import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/hooks/optimisticTickets.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { projectTicket } = await import("data:text/javascript," + encodeURIComponent(outputText));

function ticket() {
  return {
    id: 1, name: "Table 1", status: "open",
    items: [{ id: 10, type: "menu", name: "Highball", quantity: 1, unit_price: 700, subtotal: 700 }],
  };
}
const total = ticket => ticket.items.reduce((sum, item) => sum + item.subtotal, 0);
const changeQty = delta => ({key: delta, transform: ticket => ({
  ...ticket, items: ticket.items.map(item => {
    const quantity = Math.max(1, item.quantity + delta);
    return { ...item, quantity, subtotal: quantity * item.unit_price };
  }),
})});

test("later taps remain visible after an earlier request is confirmed", () => {
  const pending = [changeQty(1), changeQty(1)];
  assert.equal(projectTicket(ticket(), pending).items[0].quantity, 3);
  const server = { ...ticket(), items: [{ ...ticket().items[0], quantity: 2, subtotal: 1400 }] };
  assert.equal(projectTicket(server, pending.slice(1)).items[0].quantity, 3);
  assert.equal(total(projectTicket(server, pending.slice(1))), 2100);
});

test("failed edits roll back without discarding unrelated pending edits", () => {
  const price = {key: 3, transform: ticket => ({
    ...ticket, items: ticket.items.map(item => ({ ...item, unit_price: 800, subtotal: item.quantity * 800 })),
  })};
  assert.equal(total(projectTicket(ticket(), [changeQty(1), price])), 1600);
  assert.equal(total(projectTicket(ticket(), [price])), 800); // quantity failure
  assert.equal(total(projectTicket(ticket(), [])), 700); // all requests rejected
});

test("temporary rows appear immediately and are replaced with server IDs", () => {
  const add = {key: 4, transform: ticket => ({...ticket, items: [
    ...ticket.items, {id: -1, type: "menu", name: "Beer", quantity: 2, unit_price: 900, subtotal: 1800},
  ]})};
  assert.equal(total(projectTicket(ticket(), [add])), 2500);
  assert.equal(projectTicket(ticket(), [add]).items[1].id, -1);
  const saved = {...ticket(), items: [...ticket().items, {id: 20, quantity: 2, unit_price: 900, subtotal: 1800}]};
  assert.equal(projectTicket(saved, []).items[1].id, 20);
  assert.equal(total(projectTicket(saved, [])), 2500);
});

test("removal applies immediately and restores server row on failure", () => {
  const remove = {key: 5, transform: ticket => ({...ticket, items: ticket.items.filter(item => item.id !== 10)})};
  assert.equal(total(projectTicket(ticket(), [remove])), 0);
  assert.equal(total(projectTicket(ticket(), [])), 700);
});
