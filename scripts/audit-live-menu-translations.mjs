// Read-only audit of public menu display strings against the checked-in JA catalog.
// No credentials, ticket data, or writes. Invoke: npm run i18n:menu-audit
import { readFileSync } from "node:fs";

const api = process.env.BARTICKET_MENU_URL ?? "https://bar-ticket-api-taupe.vercel.app/menu";
const catalog = readFileSync(new URL("../src/i18n/translations.ts", import.meta.url), "utf8");
const section = catalog.slice(catalog.indexOf("export const menuJa:"));
if (!section) throw Error("Missing menuJa translation dictionary");
const translated = new Set();
for (const match of section.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:/gm)) {
    translated.add(JSON.parse(match[1]));
}
const response = await fetch(api, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw Error("Read-only menu request failed: HTTP " + response.status);
const menu = await response.json();
if (!Array.isArray(menu.items)) throw Error("Unexpected public menu format");
const fields = ["name", "brand", "category", "subcategory", "description", "notes"];
const missing = {};
for (const field of fields) {
    const all = new Set(menu.items.map(item => item[field]).filter(
        value => typeof value === "string" && value.trim() !== ""
    ));
    missing[field] = [...all].filter(value => !translated.has(value) &&
        !/^[\u3040-\u30ff\u3400-\u9fff]/u.test(value)).sort();
}
const untranslated = Object.values(missing).reduce((sum, values) => sum + values.length, 0);
console.log(JSON.stringify({menuItemCount:menu.items.length, dictionaryCount:translated.size,
    missing, missingDisplayFieldOccurrences:untranslated}, null, 2));
