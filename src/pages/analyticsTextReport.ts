import type { AnalyticsShiftReport } from "../api/account";

export type ReportRange = "all" | "year" | "month" | "day";

type ReportTotals = {
    nights: number;
    revenue: number;
    cash: number;
    card: number;
    other: number;
    unknownPayment: number;
    missingTicketNights: number;
    cover: number;
    guests: number;
    paid: number;
    cancelled: number;
    seconds: number;
};

type ReportItem = { name: string; quantity: number; revenue: number };

export type AnalyticsTextReportInput = {
    range: ReportRange;
    label: string;
    locale: "en" | "ja";
    shifts: readonly AnalyticsShiftReport[];
    totals: ReportTotals;
    topItems: readonly ReportItem[];
};

function yen(amount: number): string {
    return "¥" + Math.round(amount).toLocaleString("ja-JP");
}

function hours(seconds: number, ja: boolean): string {
    const minutes = Math.round(seconds / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return ja ? h + "時間" + m + "分" : h + "h " + m + "m";
}

function groupedBreakdown(range: ReportRange, shifts: readonly AnalyticsShiftReport[]): { name: string; revenue: number; guests: number; nights: number }[] {
    const rows = new Map<string, { name: string; revenue: number; guests: number; nights: number }>();
    const dates = new Map<string, number>();
    for (const shift of shifts) {
        dates.set(shift.business_date, (dates.get(shift.business_date) ?? 0) + 1);
    }
    for (const shift of shifts) {
        const name = range === "all" ? shift.business_date.slice(0, 4)
            : range === "year" ? shift.business_date.slice(0, 7)
            : shift.business_date + ((dates.get(shift.business_date) ?? 0) > 1 ? " (#" + shift.id + ")" : "");
        const row = rows.get(name) ?? { name, revenue: 0, guests: 0, nights: 0 };
        row.revenue += shift.paid_total;
        row.guests += shift.guest_count;
        row.nights += 1;
        rows.set(name, row);
    }
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function staffDrinkRows(shifts: readonly AnalyticsShiftReport[]) {
    const rows = new Map<string, { name: string; drink: string; quantity: number; revenue: number }>();
    for (const shift of shifts) {
        for (const item of shift.staff_drinks ?? []) {
            const key = item.staff_id + "|" + item.staff_name + "|" + item.drink_name + "|" + item.unit_price;
            const row = rows.get(key) ?? { name: item.staff_name, drink: item.drink_name, quantity: 0, revenue: 0 };
            row.quantity += item.quantity;
            row.revenue += item.revenue;
            rows.set(key, row);
        }
    }
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || a.drink.localeCompare(b.drink));
}

function staffHoursRows(shifts: readonly AnalyticsShiftReport[]) {
    const rows = new Map<number, { name: string; seconds: number }>();
    for (const shift of shifts) {
        for (const person of shift.staff_hours) {
            const row = rows.get(person.user_id) ?? { name: person.name, seconds: 0 };
            row.seconds += person.seconds;
            rows.set(person.user_id, row);
        }
    }
    return [...rows.values()].filter((row) => row.seconds > 0).sort((a, b) => b.seconds - a.seconds);
}

/** Only finalized, closed shifts may produce shareable text. Reject mixed input too. */
export function createAnalyticsTextReport(input: AnalyticsTextReportInput): string {
    const { range, label, locale, shifts, totals, topItems } = input;
    if (shifts.length === 0 || shifts.some((shift) => shift.status !== "closed")) return "";
    const ja = locale === "ja";
    const tr = (en: string, jp: string) => ja ? jp : en;
    const line = (name: string, value: string | number) => name + ": " + value;
    const section = (name: string) => ["", "— " + name + " —"];
    const result: string[] = [
        tr("ROCK BAR FXXKUP", "ロックバー Fxxkup"),
        tr("Analytics Report", "分析レポート") + " · " + label,
    ];
    if (range !== "day") {
        result.push(tr("Closed shifts only", "締め済みシフトのみ"));
    } else {
        result.push(line(tr("Manager", "開始担当"), shifts[0].opened_by ?? tr("No shift recorded", "シフト記録なし")));
    }
    if (range === "day" && shifts.length === 1 && shifts[0].venue_status === "closed") {
        result.push(line(tr("Venue status", "店舗状態"), shifts[0].venue_event ?? tr("Closed", "休業")));
    }

    result.push(...section(tr("Overview", "概要")));
    result.push(line(tr("Revenue", "売上"), yen(totals.revenue)));
    result.push(line(tr("Guests", "客数"), totals.guests));
    result.push(line(tr("Average per guest", "客単価"), totals.guests ? yen(totals.revenue / totals.guests) : "—"));
    result.push(line(tr("Cover revenue", "チャージ売上"), yen(totals.cover)));
    result.push(line(tr("Shifts", "シフト数"), totals.nights));
    result.push(line(tr("Average per shift", "1シフト平均売上"), yen(totals.revenue / totals.nights)));
    result.push(line(tr("Average guests per shift", "1シフト平均客数"), Math.round(totals.guests / totals.nights)));
    if (totals.missingTicketNights) {
        result.push(line(tr("Ticket counts unavailable for shifts", "チケット件数未記録のシフト"), totals.missingTicketNights));
    } else {
        result.push(line(tr("Paid / cancelled tickets", "会計済み・キャンセル"), totals.paid + " / " + totals.cancelled));
    }
    result.push(line(tr("Recorded staff hours", "記録済み勤務時間"), hours(totals.seconds, ja)));

    result.push(...section(tr("Payments", "支払方法")));
    const noBreakdown = totals.unknownPayment > 0 && totals.cash + totals.card + totals.other === 0;
    result.push(line(tr("Cash", "現金"), noBreakdown ? "—" : yen(totals.cash)));
    result.push(line(tr("Credit card", "クレジットカード"), noBreakdown ? "—" : yen(totals.card)));
    result.push(line(tr("PayPay / other", "PayPay・その他"), noBreakdown ? "—" : yen(totals.other)));
    if (totals.unknownPayment > 0) {
        result.push(line(tr("Payment type not recorded", "支払方法未記録"), yen(totals.unknownPayment)));
    }

    if (range === "day") {
        const stockouts = shifts[0].stockouts ?? [];
        if (stockouts.length) {
            result.push(...section(tr("Stockouts recorded", "品切れ記録")));
            result.push(...stockouts.map((stockout) => "- " + stockout.item));
        }
    }

    if (range !== "day") {
        const title = range === "all" ? tr("By year", "年別") : range === "year" ? tr("By month", "月別") : tr("By shift", "シフト別");
        result.push(...section(title));
        for (const row of groupedBreakdown(range, shifts)) {
            result.push(row.name + " · " + yen(row.revenue) + " · " + row.guests + " " + tr("guests", "名"));
        }
    }

    if (range !== "day") {
        const weekdays = ja ? ["月", "火", "水", "木", "金", "土", "日"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const byWeekday = Array.from({ length: 7 }, () => ({ revenue: 0, guests: 0, nights: 0 }));
        for (const shift of shifts) {
            const index = (new Date(shift.business_date + "T12:00:00Z").getUTCDay() + 6) % 7;
            const row = byWeekday[index];
            row.revenue += shift.paid_total;
            row.guests += shift.guest_count;
            row.nights += 1;
        }
        result.push(...section(tr("By weekday", "曜日別")));
        for (let index = 0; index < 7; index++) {
            const row = byWeekday[index];
            result.push(weekdays[index] + ": " + yen(row.revenue) + " · " + row.guests + " " + tr("guests", "名") + " · " + row.nights + " " + tr("shifts", "回"));
        }
    }

    result.push(...section(tr("Top 3 selling items", "販売数 TOP 3")));
    if (topItems.length) {
        result.push(...topItems.map((item, index) =>
            (index + 1) + ". " + item.name + " · " + item.quantity + " " + tr("units", "杯") + " · " + yen(item.revenue)));
    } else {
        result.push(tr("No recorded items", "販売商品データなし"));
    }
    const people = staffHoursRows(shifts);
    if (people.length) {
        result.push(...section(tr("Staff hours", "勤務時間")));
        result.push(...people.map((person) => "- " + person.name + ": " + hours(person.seconds, ja)));
    }

    const drinks = staffDrinkRows(shifts);
    if (drinks.length) {
        result.push(...section(tr("Staff drinks", "スタッフドリンク")));
        for (const item of drinks) result.push("- " + item.name + " · " + item.drink + " × " + item.quantity + " · " + yen(item.revenue));
    }
    return result.join("\n");
}
