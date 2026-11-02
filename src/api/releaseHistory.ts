import type { ReleaseNote } from "./releaseNotes";

export interface AppRelease { id: string; sha: string; builtAt: string; note?: ReleaseNote }
export interface ReleaseHistory { schema: 1; releases: AppRelease[] }
export const RELEASE_HISTORY_MAX_BYTES = 2 * 1024 * 1024;

function parseNote(value: unknown): ReleaseNote {
    const isObject = (item: unknown): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item);
    const keysAre = (item: Record<string, unknown>, expected: string[]) => {
        const keys = Object.keys(item);
        return keys.length === expected.length && expected.every(key => keys.includes(key));
    };
    const safeText = (item: unknown, maximum: number): item is string =>
        typeof item === "string" && item.trim().length > 0 && item.length <= maximum &&
        [...item].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
    if (!isObject(value) || !keysAre(value, ["title", "features"]) || !isObject(value.title) || !isObject(value.features) ||
        !keysAre(value.title, ["en", "ja"]) || !keysAre(value.features, ["en", "ja"])) throw new Error("Invalid release note");
    const title = value.title;
    const features = value.features;
    if (!safeText(title.en, 120) || !safeText(title.ja, 120)) throw new Error("Invalid release note title");
    const parseFeatures = (items: unknown): string[] => {
        if (!Array.isArray(items) || items.length < 1 || items.length > 5 || !items.every(item => safeText(item, 180))) throw new Error("Invalid release note features");
        return [...items];
    };
    const en = parseFeatures(features.en);
    const ja = parseFeatures(features.ja);
    if (en.length !== ja.length) throw new Error("Release note languages must have matching feature counts");
    return { title: { en: title.en, ja: title.ja }, features: { en, ja } };
}

export function parseReleaseHistory(value: unknown): ReleaseHistory {
    if (!value || typeof value !== "object" || !("schema" in value) || value.schema !== 1 || !("releases" in value) || !Array.isArray(value.releases) || value.releases.length > 10000) throw new Error("Invalid release history");
    const releases = new Map<string, AppRelease>();
    for (const row of value.releases) {
        if (!row || typeof row !== "object" || typeof row.id !== "string" || !/^[1-9]\d*:[1-9]\d*$/.test(row.id) || typeof row.sha !== "string" || !/^[a-f0-9]{40}$/.test(row.sha) || typeof row.builtAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(row.builtAt) || !Number.isFinite(Date.parse(row.builtAt)) || new Date(row.builtAt).toISOString().replace(".000Z", "Z") !== row.builtAt) throw new Error("Invalid release record");
        const entry: AppRelease = { id: row.id, sha: row.sha, builtAt: row.builtAt };
        if ("note" in row) entry.note = parseNote(row.note);
        const prior = releases.get(entry.id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(entry)) throw new Error("Conflicting release record");
        releases.set(entry.id, entry);
    }
    return { schema: 1, releases: [...releases.values()].sort((a, b) => b.builtAt.localeCompare(a.builtAt) || b.id.localeCompare(a.id)) };
}

export async function loadReleaseHistory(signal: AbortSignal): Promise<ReleaseHistory> {
    // Public app metadata only. Never forward the API bearer token or mutate data.
    const response = await fetch(`${import.meta.env.BASE_URL}release-history.json`, { cache: "no-store", credentials: "omit", signal });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Release history unavailable");
    const text = await response.text();
    if (new TextEncoder().encode(text).length > RELEASE_HISTORY_MAX_BYTES) throw new Error("Release history too large");
    return parseReleaseHistory(JSON.parse(text));
}
