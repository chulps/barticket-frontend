// Finds new interface copy and adds it to src/i18n/translations.ts.
// Japanese comes from MyMemory (free, no key). Only strings that are not
// already in the file are sent. Anonymous use is capped at about 5,000
// characters a day: https://mymemory.translated.net/doc/usagelimits.php

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");
const catalogPath = path.join(srcDir, "i18n", "translations.ts");
const MYMEMORY = "https://api.mymemory.translated.net/get";

const catalogSource = fs.readFileSync(catalogPath, "utf8");
const english = parseObject(objectBlock(catalogSource, "const en = {"));
const japanese = parseObject(objectBlock(catalogSource, "const ja"));
const englishValues = new Map([...english.entries()].map(([key, value]) => [value, key]));

if (english.size < 50) {
    console.error(`Could not read the translation file (found ${english.size} English strings).`);
    process.exit(1);
}

const files = walk(srcDir);
const additions = [];
const rewrites = [];
const missingKeys = [];

for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const masked = maskNonCode(source);

    for (const found of findCalls(masked, /(?<![\w.])t\(\s*(["'])((?:\\.|(?!\1).)*)\1/g)) {
        const text = decode(found.raw);
        if (english.has(text)) continue;
        if (isFreshCopy(text)) additions.push({ text, file });
        else missingKeys.push({ text, file, index: found.index });
    }

    for (const found of jsxText(masked)) {
        const text = found.raw.replace(/\s+/g, " ").trim();
        if (!isFreshCopy(text) || english.has(text) || englishValues.has(text)) continue;
        additions.push({ text, file });
        rewrites.push({
            file,
            start: found.start,
            end: found.end,
            insert: `{t(${JSON.stringify(text)})}`,
        });
    }

    for (const found of findCalls(
        masked,
        /(placeholder|title|aria-label|alt)\s*=\s*(["'])((?:\\.|(?!\2).)*)\2/g,
        3,
    )) {
        const text = decode(found.raw);
        if (!isFreshCopy(text) || english.has(text) || englishValues.has(text)) continue;
        additions.push({ text, file });
        rewrites.push({
            file,
            start: found.quoteStart,
            end: found.quoteEnd,
            insert: `{t(${JSON.stringify(text)})}`,
        });
    }

    for (const found of findCalls(masked, /window\.alert\(\s*(["'])((?:\\.|(?!\1).)*)\1/g)) {
        const text = decode(found.raw);
        if (!isFreshCopy(text) || english.has(text) || englishValues.has(text)) continue;
        additions.push({ text, file });
        rewrites.push({
            file,
            start: found.quoteStart,
            end: found.quoteEnd,
            insert: `t(${JSON.stringify(text)})`,
        });
    }
}

if (missingKeys.length > 0) {
    for (const missing of missingKeys) {
        console.error(
            `${relative(missing.file)}:${lineOf(fs.readFileSync(missing.file, "utf8"), missing.index)}  t("${missing.text}") is not in the translation file. Write the English sentence instead, for example t("Save draft").`,
        );
    }
    process.exit(1);
}

const unique = [...new Map(additions.map((item) => [item.text, item])).values()];

if (unique.length === 0 && [...english.keys()].every((key) => japanese.get(key))) {
    console.log("No new UI strings.");
    process.exit(0);
}

const pending = [];
for (const [key, value] of english) {
    if (!japanese.get(key)) pending.push({ key, english: value, file: catalogPath });
}
for (const item of unique) {
    if (!english.has(item.text)) pending.push({ key: item.text, english: item.text, file: item.file });
}

for (const item of pending) {
    item.japanese = await translate(item.english);
    console.log(`${relative(item.file)}  ${item.english} → ${item.japanese}`);
    await delay(250);
}

let nextCatalog = catalogSource;
const englishLines = pending.filter((item) => !english.has(item.key)).map((item) => entryLine(item.key, item.english));
const japaneseLines = pending.map((item) => entryLine(item.key, item.japanese));
if (englishLines.length > 0) nextCatalog = insertEntries(nextCatalog, "const en = {", englishLines);
if (japaneseLines.length > 0) nextCatalog = insertEntries(nextCatalog, "const ja", japaneseLines);
fs.writeFileSync(catalogPath, nextCatalog);

const byFile = new Map();
for (const rewrite of rewrites) {
    const list = byFile.get(rewrite.file) ?? [];
    list.push(rewrite);
    byFile.set(rewrite.file, list);
}

const filesToWire = new Set(
    additions.map((item) => item.file).filter((file) => file.endsWith(".ts") || file.endsWith(".tsx")),
);

for (const file of filesToWire) {
    let source = fs.readFileSync(file, "utf8");
    const ordered = [...(byFile.get(file) ?? [])].sort((a, b) => b.start - a.start);
    for (const edit of ordered) {
        source = source.slice(0, edit.start) + edit.insert + source.slice(edit.end);
    }
    source = ensureTranslator(source, file);
    fs.writeFileSync(file, source);
}

function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "i18n") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
    }
    return out;
}

function objectBlock(source, marker) {
    const markerAt = source.indexOf(marker);
    const brace = source.indexOf("{", source.indexOf("=", markerAt));
    return source.slice(brace, matchBrace(source, brace) + 1);
}

function parseObject(block) {
    const entries = new Map();
    const pattern = /(?:"((?:\\.|[^"\\])*)"|([A-Za-z_][A-Za-z0-9_]*))\s*:\s*"((?:\\.|[^"\\])*)"/g;
    for (const match of block.matchAll(pattern)) {
        const key = match[1] !== undefined ? JSON.parse(`"${match[1]}"`) : match[2];
        entries.set(key, JSON.parse(`"${match[3]}"`));
    }
    return entries;
}

function maskNonCode(source) {
    let out = "";
    let index = 0;
    while (index < source.length) {
        if (source.startsWith("/*", index)) {
            const end = source.indexOf("*/", index + 2);
            const stop = end === -1 ? source.length : end + 2;
            out += " ".repeat(stop - index);
            index = stop;
            continue;
        }
        if (source.startsWith("//", index)) {
            const end = source.indexOf("\n", index);
            const stop = end === -1 ? source.length : end;
            out += " ".repeat(stop - index);
            index = stop;
            continue;
        }
        if (source[index] === "`") {
            let cursor = index + 1;
            while (cursor < source.length) {
                if (source[cursor] === "\\") {
                    cursor += 2;
                    continue;
                }
                if (source[cursor] === "`") {
                    cursor += 1;
                    break;
                }
                cursor += 1;
            }
            out += " ".repeat(cursor - index);
            index = cursor;
            continue;
        }
        out += source[index];
        index += 1;
    }
    return out;
}

function findCalls(source, pattern, group = 2) {
    const found = [];
    for (const match of source.matchAll(pattern)) {
        const raw = match[group];
        const valueStart = match.index + match[0].lastIndexOf(raw);
        found.push({
            raw,
            index: match.index,
            quoteStart: valueStart - 1,
            quoteEnd: valueStart + raw.length + 1,
            valueStart: valueStart - 1,
            valueEnd: valueStart + raw.length + 1,
        });
    }
    return found;
}

function jsxText(source) {
    const found = [];
    const pattern = />([^<>{}]+)</g;
    for (const match of source.matchAll(pattern)) {
        const raw = match[1];
        if (!raw.trim() || source[match.index - 1] === "=") continue;
        found.push({
            raw,
            start: match.index + 1,
            end: match.index + 1 + raw.length,
        });
    }
    return found;
}

function isFreshCopy(text) {
    if (text.length < 2 || !/[A-Za-z]/.test(text)) return false;
    if (/^(https?:|\/|\.|#)/.test(text)) return false;
    if (/^(true|false|null|undefined|GET|POST|PATCH|PUT|DELETE)$/i.test(text)) return false;
    if (/^var\(--|^#[0-9a-f]{3,8}$/i.test(text)) return false;
    if (/^[\d.]+(px|rem|em|vh|vw|%)$/.test(text)) return false;
    if (/^[a-z]+(-[a-z0-9]+)+$/.test(text)) return false;
    if (/^[a-z][a-zA-Z0-9]*$/.test(text)) return false;
    if (/^\d+(\.\d+)?\s*(ml|cl|oz|g|kg|l)$/i.test(text)) return false;
    if (/[&|;]/.test(text)) return false;
    return true;
}

function decode(raw) {
    return JSON.parse(`"${raw}"`);
}

async function translate(text) {
    const names = [];
    const masked = text.replace(/\{([A-Za-z0-9_]+)\}/g, (_, name) => {
        names.push(name);
        return `{{${name}}}`;
    });
    if (Buffer.byteLength(masked) > 450) {
        throw new Error(`"${text}" is too long for MyMemory. Split it into shorter sentences.`);
    }

    const url = new URL(MYMEMORY);
    url.searchParams.set("q", masked);
    url.searchParams.set("langpair", "en|ja");
    let response;
    try {
        response = await fetch(url);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not reach MyMemory to translate "${text}". ${reason}`);
    }
    if (!response.ok) throw new Error(`MyMemory returned ${response.status} for "${text}"`);
    const body = await response.json();
    let translated = body?.responseData?.translatedText ?? "";
    if (body?.responseStatus != 200 || body?.quotaFinished || /MYMEMORY WARNING/i.test(translated)) {
        throw new Error(
            `MyMemory could not translate "${text}". ${translated || "The free daily limit may be used up."}`,
        );
    }
    translated = translated.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, "{$1}");
    for (const name of names) {
        if (!translated.includes(`{${name}}`)) {
            throw new Error(`The translation of "${text}" dropped {${name}}.`);
        }
    }
    return translated;
}

function entryLine(key, value) {
    const printedKey = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
    return `    ${printedKey}: ${JSON.stringify(value)},`;
}

function insertEntries(source, marker, lines) {
    const markerAt = source.indexOf(marker);
    const brace = source.indexOf("{", source.indexOf("=", markerAt));
    const end = matchBrace(source, brace);
    return `${source.slice(0, end)}\n${lines.join("\n")}\n${source.slice(end)}`;
}

function ensureTranslator(source, file) {
    const bodies = functionBodies(source);
    const needing = bodies.filter((body) => {
        const slice = source.slice(body.open, body.close);
        return /\bt\(/.test(slice) && !/useI18n\(/.test(slice);
    });
    const targets = needing.filter((body) => {
        const covered = bodies.some((other) => {
            if (other.open >= body.open || other.close <= body.close) return false;
            return /useI18n\(/.test(source.slice(other.open, other.close));
        });
        const nested = needing.some(
            (other) => other.open < body.open && other.close > body.close,
        );
        return !covered && !nested;
    });

    const inserts = [...targets].sort((a, b) => b.open - a.open);
    for (const body of inserts) {
        const after = source.slice(body.open + 1, body.open + 80);
        const indent = after.match(/\n([ \t]+)/)?.[1] ?? "    ";
        source = `${source.slice(0, body.open + 1)}\n${indent}const { t } = useI18n();${source.slice(body.open + 1)}`;
    }
    return ensureImport(source, file);
}

function functionBodies(source) {
    const bodies = [];
    const patterns = [
        /function\s*[A-Za-z0-9_]*\s*\([^)]*\)\s*\{/g,
        /const\s+[A-Za-z0-9_]+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g,
    ];
    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            const open = match.index + match[0].length - 1;
            const close = matchBrace(source, open);
            if (close !== -1) bodies.push({ open, close });
        }
    }
    return bodies;
}

function ensureImport(source, file) {
    if (!/\bt\(/.test(source)) return source;
    const named = source.match(/import\s*\{([^}]+)\}\s*from\s*["']([^"']*\/i18n)["']/);
    if (named) {
        if (/\buseI18n\b/.test(named[1])) return source;
        return source.replace(named[0], `import { ${named[1].trim()}, useI18n } from "${named[2]}"`);
    }
    let spec = path.relative(path.dirname(file), path.join(srcDir, "i18n")).split(path.sep).join("/");
    if (!spec.startsWith(".")) spec = `./${spec}`;
    const line = `import { useI18n } from "${spec}";`;
    const imports = [...source.matchAll(/^import .+$/gm)];
    if (imports.length === 0) return `${line}\n${source}`;
    const last = imports.at(-1);
    const at = last.index + last[0].length;
    return `${source.slice(0, at)}\n${line}${source.slice(at)}`;
}

function matchBrace(source, open) {
    let depth = 0;
    let quote = "";
    for (let index = open; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (char === "\\") {
                index += 1;
                continue;
            }
            if (char === quote) quote = "";
            continue;
        }
        if (char === '"' || char === "'" || char === "`") {
            quote = char;
            continue;
        }
        if (char === "{") depth += 1;
        else if (char === "}") {
            depth -= 1;
            if (depth === 0) return index;
        }
    }
    return -1;
}

function lineOf(source, index) {
    return source.slice(0, index).split("\n").length;
}

function relative(file) {
    return path.relative(root, file);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
