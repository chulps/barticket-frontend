/** Business dates are calendar labels, not instants in the browser's timezone. */
export function businessDateLabel(date: string, locale: "en" | "ja") {
    return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
        timeZone: "UTC", weekday: "short", month: "short", day: "numeric",
    }).format(new Date(date + "T12:00:00Z"));
}

export function weekdayLabel(weekday: number, locale: "en" | "ja") {
    return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
        timeZone: "UTC", weekday: "short",
    }).format(new Date(Date.UTC(2024, 0, 1 + weekday)));
}

type Weekday = { weekday: number; shift_count: number; average_sales_yen: number | null };
export function bestWeekdays(rows: Weekday[]) {
    const eligible = rows.filter(row => row.shift_count > 0 && row.average_sales_yen !== null);
    const best = Math.max(...eligible.map(row => row.average_sales_yen!));
    return eligible.filter(row => row.average_sales_yen === best).map(row => row.weekday).sort((a, b) => a - b);
}

export function signedBar(value: number, min: number, max: number) {
    const span = max - min || 1;
    return { left: (Math.min(0, value) - min) / span * 100, width: Math.abs(value) / span * 100, zero: -min / span * 100 };
}
