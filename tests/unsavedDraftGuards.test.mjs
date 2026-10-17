import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = (file) => readFileSync(new URL("../src/" + file, import.meta.url), "utf8");

test("modal dismissal consults close guard for escape, backdrop and cancel", () => {
  const provider = source("context/ModalProvider.tsx");
  const host = source("components/ModalHost.tsx");
  assert.match(provider, /if \(guardRef\.current && !guardRef\.current\(\)\) return/);
  assert.match(provider, /forceCloseModal/);
  assert.match(host, /if \(e\.key === "Escape"\)/);
  assert.match(host, /event\.target === event\.currentTarget\) closeModal\(\)/);
});

test("unsaved menu changes prompt before close but successful saves bypass the guard", () => {
  for (const file of ["components/MenuPriceEditor.tsx", "components/MenuItemForm.tsx"]) {
    const value = source(file);
    assert.match(value, /registerCloseGuard/);
    assert.match(value, /dirty\.current/);
    assert.match(value, /window\.confirm/);
    assert.match(value, /onChangeCapture/);
    assert.match(value, /forceCloseModal\(\)/);
    assert.match(value, /pending\.current/);
  }
});

test("ticket price drafts are guarded before switching or leaving tickets", () => {
  const ticket = source("components/TicketDetails/Ticket.tsx");
  assert.match(ticket, /editingPriceItemId !== null && !window\.confirm/);
  assert.match(ticket, /onClose=\{\(\) => navigateFromDraft\(onClose\)\}/);
  assert.match(ticket, /onPrevious=\{\(\) => navigateFromDraft\(onPrevious\)\}/);
  assert.match(ticket, /onNext=\{\(\) => navigateFromDraft\(onNext\)\}/);
});
