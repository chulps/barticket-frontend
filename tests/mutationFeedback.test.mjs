import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const src = path => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");

test("accessible status toasts listen for a shared event and have distinct error semantics", () => {
  const host = src("components/MutationToastHost.tsx");
  const notifier = src("utils/mutationFeedback.ts");
  const app = src("App.tsx");
  assert.match(notifier, /new CustomEvent<MutationFeedback>\(FEEDBACK_EVENT/);
  assert.match(host, /role=\{message\.kind === "error" \? "alert" : "status"\}/);
  assert.match(host, /aria-live=\{message\.kind === "error" \? "assertive" : "polite"\}/);
  assert.match(host, /safe-area-inset-bottom/);
  assert.match(app, /<MutationToastHost \/>/);
});

test("batched ticket additions await every server result before closing, keeping failures", () => {
  const picker = src("components/AddItemPicker.tsx");
  const hook = src("hooks/useTickets.ts");
  assert.match(picker, /const handleSave = async \(\) =>/);
  assert.match(picker, /if \(await onAddItem\(selection\.item, selection\.priceKey, selection\.quantity\)\)/);
  assert.match(picker, /setSelectedItems\(failures\)/);
  assert.match(picker, /failures\.length === 0/);
  assert.match(picker, /forceCloseModal\(\)/);
  assert.match(picker, /disabled=\{saving\}/);
  assert.match(picker, /Check the ticket before trying again/);
  assert.match(hook, /addItemToTicket = \([\s\S]*?\): Promise<boolean>/);
  assert.match(hook, /\.then\(saved => saved !== null\)/);
});

test("menu stock, price and creation success feedback happens after confirmed API saves", () => {
  const menu = src("pages/Menu.tsx");
  const itemForm = src("components/MenuItemForm.tsx");
  assert.match(menu, /const saved = await onToggleStock\(item\)/);
  assert.match(menu, /notifyMutation\("success"[\s\S]*?"Stock status updated"/);
  assert.match(menu, /const saved = await onSavePrices\(item, prices\)/);
  assert.match(menu, /"Menu prices saved"/);
  assert.match(itemForm, /await createMenuItem\(/);
  assert.match(itemForm, /"Item added to menu"/);
});

test("updated TSX components parse without syntax errors", () => {
  for (const path of ["components/MutationToastHost.tsx","components/AddItemPicker.tsx",
    "components/AddStaffDrink.tsx", "components/TicketDetails/TicketItems.tsx"]) {
    const diagnostics = ts.createSourceFile(path,src(path),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics;
    assert.deepEqual(diagnostics.map(d=>d.messageText), [], path);
  }
});
