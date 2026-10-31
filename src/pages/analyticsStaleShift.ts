/** Only the explicit stale-night conflict is recoverable as a partial report. */
export type StaleAnalyticsShift = { shiftId: number; businessDate: string };

export function staleAnalyticsShift(error: unknown): StaleAnalyticsShift | null {
    if (!error || typeof error !== "object" || !("status" in error) || error.status !== 409 ||
        !("detail" in error) || !error.detail || typeof error.detail !== "object") return null;
    const detail = error.detail as Record<string, unknown>;
    if (detail.code !== "STALE_OPEN_SHIFT" || !Number.isSafeInteger(detail.shift_id) ||
        Number(detail.shift_id) <= 0 || typeof detail.business_date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(detail.business_date)) return null;
    return { shiftId: Number(detail.shift_id), businessDate: detail.business_date };
}

export function formatBusinessNight(iso: string, locale: "en" | "ja"): string {
    const [year, month, day] = iso.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, day));
    const end = new Date(Date.UTC(year, month - 1, day + 1));
    const tag = locale === "ja" ? "ja-JP" : "en-US";
    const format = (date: Date) => date.toLocaleDateString(tag, {
        timeZone: "UTC", year: "numeric", month: "short", day: "numeric",
    });
    return `${format(start)} – ${format(end)}`;
}
