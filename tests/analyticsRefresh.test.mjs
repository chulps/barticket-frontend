import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/analyticsRefresh.ts", import.meta.url), "utf8");
const moduleSource = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { createRefreshCoordinator } = await import("data:text/javascript," + encodeURIComponent(moduleSource));

function deferred() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
}

test("analytics refresh coalesces a focus and push burst into one trailing read", async () => {
    const reads = [];
    const refresh = createRefreshCoordinator(() => {
        const read = deferred();
        reads.push(read);
        return read.promise;
    });

    const first = refresh();
    refresh();
    refresh();
    refresh();
    assert.equal(reads.length, 1);

    reads[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(reads.length, 2);
    reads[1].resolve();
    await first;
    assert.equal(reads.length, 2);
});

test("analytics refresh allows a later recovery read after a failed request", async () => {
    let reads = 0;
    const refresh = createRefreshCoordinator(async () => {
        reads += 1;
        if (reads === 1) throw new Error("offline");
    });

    await assert.rejects(refresh(), /offline/);
    await refresh();
    assert.equal(reads, 2);
});

test("Analytics memoizes expensive period and ticket aggregations", () => {
    const analytics = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");
    assert.match(analytics, /createRefreshCoordinator\(loadLatest\)/);
    assert.match(analytics, /useMemo\(\(\) => summarize\(visible\), \[visible\]\)/);
    assert.match(analytics, /topSellingItems\(tickets, new Set\(visible\.flatMap/);
});
