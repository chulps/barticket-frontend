const KEY_PREFIX = "barticket:release-dismissals:v1:";
const MAX_RECORDS = 10_000;
const MAX_BYTES = 512 * 1024;
const RELEASE_ID = /^[1-9]\d*:[1-9]\d*$/;

type DismissalRecord = { schema: 1; accountId: number; dismissedIds: string[] };
type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type DismissalLoad = { dismissedIds: string[]; repaired: boolean };

function keyFor(accountId: number): string {
    if (!Number.isSafeInteger(accountId) || accountId <= 0) throw new Error("Invalid account identity");
    return `${KEY_PREFIX}${accountId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function validIds(value: unknown): value is string[] {
    return Array.isArray(value) && value.length <= MAX_RECORDS &&
        value.every((id): id is string => typeof id === "string" && RELEASE_ID.test(id)) &&
        new Set(value).size === value.length;
}

function parseRecord(value: unknown, accountId: number): DismissalRecord {
    if (!isRecord(value) || Object.keys(value).length !== 3 ||
        value.schema !== 1 || value.accountId !== accountId || !validIds(value.dismissedIds)) {
        throw new Error("Invalid release dismissal data");
    }
    return { schema: 1, accountId, dismissedIds: value.dismissedIds };
}

export function loadDismissedReleaseIds(
    accountId: number,
    releaseIds: readonly string[],
    storage: StorageLike,
): DismissalLoad {
    const key = keyFor(accountId);
    const raw = storage.getItem(key);
    if (raw === null) return { dismissedIds: [], repaired: false };
    if (raw.length > MAX_BYTES) return { dismissedIds: [], repaired: true };
    let record: DismissalRecord;
    try {
        record = parseRecord(JSON.parse(raw), accountId);
    } catch {
        // Ignore malformed local UI state. It never changes the public ledger.
        return { dismissedIds: [], repaired: true };
    }
    const currentIds = new Set(releaseIds);
    const dismissedIds = record.dismissedIds.filter(id => currentIds.has(id));
    const repaired = dismissedIds.length !== record.dismissedIds.length;
    if (repaired) saveDismissedReleaseIds(accountId, dismissedIds, releaseIds, storage);
    return { dismissedIds, repaired };
}

export function saveDismissedReleaseIds(
    accountId: number,
    dismissedIds: readonly string[],
    releaseIds: readonly string[],
    storage: StorageLike,
): void {
    const currentIds = new Set(releaseIds);
    const unique = [...new Set(dismissedIds)];
    if (unique.length > MAX_RECORDS || unique.some(id => !RELEASE_ID.test(id) || !currentIds.has(id))) {
        throw new Error("Invalid release dismissal list");
    }
    const value: DismissalRecord = { schema: 1, accountId, dismissedIds: unique };
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_BYTES) throw new Error("Release dismissal data is too large");
    storage.setItem(keyFor(accountId), serialized);
}
