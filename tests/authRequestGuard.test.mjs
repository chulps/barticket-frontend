import test from "node:test";
import assert from "node:assert/strict";
import { isCurrentAuthRequest } from "../src/api/authRequestGuard.js";

test("auth request guard rejects stale A→B→A work despite token equality", () => {
    const original = "session-A";
    assert.equal(isCurrentAuthRequest(4, 6, original, original), false);
});

test("auth request guard accepts the current epoch and matching token", () => {
    assert.equal(isCurrentAuthRequest(7, 7, "session-A", "session-A"), true);
});

test("auth request guard rejects empty or changed tokens", () => {
    assert.equal(isCurrentAuthRequest(3, 3, null, null), false);
    assert.equal(isCurrentAuthRequest(3, 3, "session-A", "session-B"), false);
});
