import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const src = (path) => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");

test("modal traps keyboard focus, restores focus and prevents background scroll", () => {
  const host = src("components/ModalHost.tsx");
  assert.match(host, /document\.body\.style\.overflow = "hidden"/);
  assert.match(host, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(host, /previousFocus\?\.isConnected/);
  assert.match(host, /e\.key === "Escape"/);
  assert.match(host, /e\.key !== "Tab"/);
  assert.match(host, /last\.focus\(\)/);
  assert.match(host, /first\.focus\(\)/);
  assert.match(host, /ref=\{dialogRef\}/);
  assert.match(host, /tabIndex=\{-1\}/);
  assert.match(host, /aria-modal="true"/);
});

test("short phones can reach payment/footer actions and search without iOS zoom", () => {
  const footer = src("components/TicketDetails/TicketFooter.tsx");
  const header = src("components/TicketDetails/TicketHeader.tsx");
  const search = src("components/MenuSearchBar.tsx");
  const host = src("components/ModalHost.tsx");
  assert.match(footer, /position: sticky;[\s\S]*?bottom: 0;[\s\S]*?safe-area-inset-bottom/);
  assert.match(header, /min-height: 44px/);
  assert.match(header, /min-width: 44px/);
  assert.match(search, /min-height: 44px/);
  assert.match(search, /font-size: 16px/);
  assert.match(host, /height: 100dvh/);
  assert.match(host, /const Content = styled\.div`[\s\S]*?overflow-y: auto/);
});

test("changed TSX components parse", () => {
  for (const path of ["components/ModalHost.tsx", "components/TicketDetails/TicketFooter.tsx",
    "components/TicketDetails/TicketHeader.tsx", "components/MenuSearchBar.tsx"]) {
    const diagnostics = ts.createSourceFile(path,src(path),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics;
    assert.deepEqual(diagnostics.map(d=>d.messageText),[],path);
  }
});
