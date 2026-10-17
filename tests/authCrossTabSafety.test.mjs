import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/api/client.ts", import.meta.url), "utf8");

test("auth changes from another tab trigger a local revalidation without writing storage", () => {
  assert.match(app, /const onStorage = \(event: StorageEvent\) =>/);
  assert.match(app, /event\.key === "barticket_token" \|\| event\.key === null/);
  assert.match(app, /window\.dispatchEvent\(new Event\("barticket-auth"\)\)/);
  assert.match(app, /window\.addEventListener\("storage", onStorage\)/);
  assert.match(app, /window\.removeEventListener\("storage", onStorage\)/);
  assert.doesNotMatch(app.slice(app.indexOf("const onStorage"), app.indexOf("void checkAuth();")), /setToken\(/);
});

test("outstanding requests are prevented from restoring a previous account after logout or login switch", () => {
  assert.match(app, /const token = getToken\(\)/);
  assert.match(app, /setAuthenticated\(null\)/);
  assert.match(app, /current === version && getToken\(\) === token/);
  assert.match(app, /current !== version \|\| getToken\(\) !== token/);
  assert.match(app, /if \(!token\) \{ setAuthenticated\(false\); return; \}/);
});

test("session handling does not log push authorization errors or replace the server auth contract", () => {
  assert.match(client, /const TOKEN_KEY = "barticket_token"/);
  assert.match(client, /Authorization = \`Bearer \$\{token\}\`/);
  assert.doesNotMatch(client, /console\.warn\("Unable to revoke push subscription on sign out", error\)/);
  assert.doesNotMatch(app, /sessionStorage\.setItem|document\.cookie/);
});

test("changed TypeScript modules parse", () => {
  for (const [name, source] of [["App.tsx", app], ["client.ts", client]]) {
    const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true,
      name.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    assert.deepEqual(ast.parseDiagnostics.map(d => d.messageText), [], name);
  }
});
