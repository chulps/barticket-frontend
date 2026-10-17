import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = file => readFileSync(new URL("../src/" + file, import.meta.url), "utf8");

test("modal buttons use a sticky footer rather than a fixed-height overlay", () => {
  const modal = src("components/ModalHost.tsx");
  assert.doesNotMatch(modal, /background: green/);
  assert.match(modal, /const Footer = styled\.footer`[\s\S]*?position: sticky;/);
  assert.match(modal, /safe-area-inset-bottom/);
  assert.match(modal, /const Content = styled\.div`[\s\S]*?min-height: 0;/);
  assert.match(modal, /const Content = styled\.div`[\s\S]*?overflow-y: auto;/);
});

test("mobile ticket and picker content scroll within constrained viewports", () => {
  const dash = src("pages/Dashboard.tsx");
  const picker = src("components/AddItemPicker.tsx");
  const details = src("components/TicketDetails/Ticket.tsx");
  assert.match(dash, /height: 100dvh;/);
  assert.match(dash, /overscroll-behavior: contain;/);
  assert.match(dash, /safe-area-inset-bottom/);
  assert.match(picker, /const SearchBarContainer = styled\.div`[\s\S]*?position: sticky; top: 0; z-index: 5;/);
  assert.match(picker, /overscroll-behavior: contain;/);
  assert.match(details, /const TicketDetailsContainer = styled\.div`[\s\S]*?min-height: 0/);
});
