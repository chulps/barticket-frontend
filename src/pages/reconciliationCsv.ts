import type { ShiftReport } from "../api/account";

export type ImportRow = { date: string; manager: string; revenue: number; guests: number; event: string; staffHours: Record<string, number>; line: number };
export type PreviewRow = { imported: ImportRow; existing: ShiftReport | null; state: "new" | "match" | "conflict"; differences: string[] };
export type CsvData = { headers: string[]; rows: string[][] };

export function parseCsv(text: string): CsvData {
    const records: string[][] = [];
    let row: string[] = [], field = "", quoted = false;
    const value = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (quoted) {
            if (ch === '"' && value[i + 1] === '"') { field += '"'; i++; }
            else if (ch === '"') quoted = false;
            else field += ch;
        } else if (ch === '"') {
            if (field.trim()) throw new Error("Unexpected quote in CSV");
            quoted = true;
        } else if (ch === ",") { row.push(field.trim()); field = ""; }
        else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && value[i + 1] === "\n") i++;
            row.push(field.trim()); field = "";
            if (row.some(Boolean)) records.push(row);
            row = [];
        } else field += ch;
    }
    if (quoted) throw new Error("Unclosed quoted CSV field");
    row.push(field.trim());
    if (row.some(Boolean)) records.push(row);
    if (!records.length) throw new Error("CSV file is empty");
    const headers = records.shift()!;
    if (records.some(record => record.length !== headers.length)) throw new Error("CSV columns are inconsistent");
    return { headers, rows: records };
}

export function importPreview(data: CsvData, mapping: Record<string, string>, shifts: ShiftReport[]): { preview: PreviewRow[]; errors: string[] } {
    const preview: PreviewRow[] = [], errors: string[] = [];
    const byDate = new Map(shifts.map(shift => [shift.business_date, shift]));
    const seen = new Set<string>();
    const cell = (row: string[], key: string) => {
        const index = data.headers.indexOf(mapping[key]);
        return index < 0 ? "" : row[index] ?? "";
    };
    const keys = ["date", "manager", "revenue", "guests"];
    if (keys.some(key => !data.headers.includes(mapping[key]))) return { preview, errors: ["Map Date, Manager, Revenue and Guests before previewing."] };
    data.rows.forEach((row, i) => {
        const date = cell(row, "date");
        const event = cell(row, "event");
        const venueClosed = event.trim().toLowerCase() === "closed";
        const revenueText = cell(row, "revenue").replace(/[¥,\s]/g, "");
        const guestsText = cell(row, "guests").replace(/[,\s]/g, "");
        const revenue = Number(revenueText), guests = Number(guestsText);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date ||
            !cell(row, "manager") || (!revenueText && !venueClosed) || (!guestsText && !venueClosed) || !Number.isInteger(revenue) || revenue < 0 || !Number.isInteger(guests) || guests < 0) {
            errors.push("Row " + (i + 2) + ": invalid date, manager, revenue or guests."); return;
        }
        if (seen.has(date)) { errors.push("Row " + (i + 2) + ": duplicate date " + date); return; }
        seen.add(date);
        const staffHours: Record<string, number> = {};
        for (const [key, header] of Object.entries(mapping)) {
            if (!key.startsWith("hours:") || !data.headers.includes(header)) continue;
            const raw = cell(row, key);
            if (!raw) continue;
            const hours = Number(raw);
            if (!Number.isFinite(hours) || hours < 0 || hours > 24) { errors.push("Row " + (i + 2) + ": invalid hours for " + key.slice(6)); return; }
            staffHours[key.slice(6)] = hours;
        }
        const imported: ImportRow = { date, manager: cell(row, "manager"), revenue, guests, event, staffHours, line: i + 2 };
        const existing = byDate.get(date) ?? null;
        const differences = existing ? [
            ...(existing.opened_by !== imported.manager ? ["manager"] : []),
            ...(existing.paid_total !== imported.revenue ? ["revenue"] : []),
            ...(existing.guest_count !== imported.guests ? ["guests"] : [])
        ] : [];
        preview.push({ imported, existing, state: !existing ? "new" : differences.length ? "conflict" : "match", differences });
    });
    return { preview, errors };
}
