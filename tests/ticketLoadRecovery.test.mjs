import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (name) => readFileSync(new URL("../src/" + name, import.meta.url), "utf8");

test("Ticket fetch differentiates initial loading from an API failure", () => {
  const hook = read("hooks/useTickets.ts");
  assert.match(hook, /const \[ticketsLoading, setTicketsLoading\] = useState\(true\)/);
  assert.match(hook, /const \[ticketsError, setTicketsError\] = useState\(false\)/);
  assert.match(hook, /setTicketsError\(true\)/);
  assert.match(hook, /setTicketsError\(false\)/);
  assert.match(hook, /setTicketsLoading\(false\)/);
  assert.match(hook, /addEventListener\("barticket-retry-tickets", onFocus\)/);
  assert.match(hook, /removeEventListener\("barticket-retry-tickets", onFocus\)/);
});

test("Dashboard announces recoverable ticket load failure rather than empty tickets", () => {
  const dashboard = read("pages/Dashboard.tsx");
  assert.match(dashboard, /ticketsLoading && tickets\.length === 0/);
  assert.match(dashboard, /role="status" aria-live="polite"/);
  assert.match(dashboard, /TicketLoadWarning role="alert"/);
  assert.match(dashboard, /barticket-retry-tickets/);
});

test("Profile avoids a false sign-in or registration screen on lookup outage", () => {
  const profile = read("pages/Profile.tsx");
  const fail = profile.indexOf("if (getToken() && !account && error)");
  const fallbackSignIn = profile.indexOf("{!account ? (");
  assert.ok(fail !== -1 && fallbackSignIn > fail);
  assert.match(profile.slice(fail, fallbackSignIn), /role="alert"/);
  assert.match(profile.slice(fail, fallbackSignIn), /Retry/);
});

test("Touched screens parse as TSX/TypeScript", () => {
  for (const [path, kind] of [
    ["pages/Dashboard.tsx", ts.ScriptKind.TSX],
    ["pages/Profile.tsx", ts.ScriptKind.TSX],
    ["hooks/useTickets.ts", ts.ScriptKind.TS],
  ]) {
    const diagnostics = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, kind).parseDiagnostics;
    assert.deepEqual(diagnostics.map(d => d.messageText), [], path);
  }
});
