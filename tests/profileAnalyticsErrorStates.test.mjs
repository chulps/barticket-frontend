import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const src = name => readFileSync(new URL("../src/pages/" + name, import.meta.url), "utf8");

test("Profile never flashes sign-in while account status is loading", () => {
  const p=src("Profile.tsx");
  assert.match(p, /const \[loading, setLoading\] = useState\(true\)/);
  assert.match(p, /if \(!cancelled\) setLoading\(false\)/);
  assert.match(p, /if \(loading\) return <Page/);
  assert.match(p, /<RequestState kind="loading"/);
  assert.match(p, /role="alert"/);
  assert.match(p, /disabled=\{busy\}/);
});

test("Analytics has distinct loading and retry states on failed fetches", () => {
  const a=src("Analytics.tsx");
  assert.match(a, /setLoading\(false\)/);
  assert.match(a, /signedIn && loading && !shifts/);
  assert.match(a, /<RequestState kind="loading"/);
  assert.match(a, /window\.location\.reload\(\)/);
});

test("Admin displays loading and refresh progress accessibly", () => {
  const a=src("Admin.tsx");
  assert.match(a, /<RequestState kind="loading" detail=\{t\("loading"\)\}/);
  assert.match(a, /accountsLoading \?/);
});

test("changed screens have valid TSX syntax", () => {
  for (const name of ["Profile.tsx", "Analytics.tsx", "Admin.tsx"]) {
    const diagnostics=ts.createSourceFile(name,src(name),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics;
    assert.deepEqual(diagnostics.map(d=>d.messageText), [],name);
  }
});
