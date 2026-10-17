import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync(new URL("../src/i18n/translations.ts", import.meta.url), "utf8");
const localeCode = readFileSync(new URL("../src/i18n/index.ts", import.meta.url), "utf8");
const menu = catalog.slice(catalog.indexOf("export const menuJa:"));
const knownNewEntries = [
    "Ardbeg 10",
    "Custom cocktail (adjust price)",
    "Highball lottery",
    "Islay whiskey lottery",
    "Japanese Lottery",
    "Nikka from the Barrel",
    "Octomore",
    "Octomore 16.2",
    "Shot Lottery",
    "Ardbeg",
    "Bruichladdic",
    "Custom",
    "Lottery",
    "Roulette for Islay whiskey lottery",
    "Roulette for a chance to win",
    "Roulette for highball lottery",
    "Roulette for shot lottery",
    "Adjust price for custom cocktails",
    "Japanese whiskey lottery",
];

test("newest database menu labels and lottery descriptions have Japanese translations", () => {
    for (const entry of knownNewEntries) {
        const prefix = JSON.stringify(entry) + ": ";
        const line = menu.split("\n").find(row => row.trim().startsWith(prefix));
        assert.ok(line, "Missing translation for: " + entry);
        assert.match(line.slice(line.indexOf(prefix) + prefix.length), /[\u3040-\u30ff\u3400-\u9fff]/u, entry);
    }
});
test("localized menu and ticket searches include both source and translation text", () => {
    assert.match(localeCode, /menuJa\[text\] \?\? text/);
    assert.match(localeCode, /\`\$\{text\} \$\{japanese\}\`/);
});
