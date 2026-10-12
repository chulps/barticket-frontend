/**
 * Calendar stepping for the Analytics period navigator.
 *
 * Use UTC for date-only math so moving by a day doesn't skip or repeat dates
 * around daylight-saving transitions in the browser's local time zone.
 */
export function shiftYear(year: string, delta: number): string {
    return String(Number(year) + delta);
}

export function shiftMonth(key: string, delta: number): string {
    const [year, month] = key.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftDay(iso: string, delta: number): string {
    const [year, month, day] = iso.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + delta));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/**
 * A selected analytics bar drills down exactly one level:
 * All Time (yearly bars) → Year, Year (monthly bars) → Month,
 * Month (daily bars) → the report for that shift's business date.
 *
 * The daily bar's id is the shift ID, not its date. Resolve it using the
 * actual shift record to avoid parsing locale-dependent labels or dates.
 */
export type DrillDownSource = "all" | "year" | "month";
export type DrillDownTarget =
    | { range: "year"; key: string }
    | { range: "month"; key: string }
    | { range: "day"; key: string; shiftId: number };

export function analyticsDrillDownTarget(
    source: DrillDownSource,
    barId: string,
    shifts: readonly { id: number; business_date: string }[],
): DrillDownTarget | null {
    if (source === "all") {
        return /^\\d{4}$/.test(barId) ? { range: "year", key: barId } : null;
    }
    if (source === "year") {
        return /^\\d{4}-(0[1-9]|1[0-2])$/.test(barId) ? { range: "month", key: barId } : null;
    }
    const shift = shifts.find((entry) => String(entry.id) === barId);
    return shift ? { range: "day", key: shift.business_date, shiftId: shift.id } : null;
}
