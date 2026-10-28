import type { Account } from "../api/account";
import type { HistoricalHoursSourceRow } from "../api/historicalHours";
import type { CsvData } from "./reconciliationCsv";

export function buildHistoricalHoursBatch(
    csv: CsvData,
    mapping: Record<string, string>,
    includeHours: string[],
    users: Account[],
    fileName: string,
): { sourceFile: string; rows: HistoricalHoursSourceRow[] } {
    const dateIndex = csv.headers.indexOf(mapping.date ?? "");
    if (dateIndex < 0) throw new Error("Map the business date column before reconciling staff hours.");
    const columns = includeHours.flatMap(name => {
        const header = mapping[`hours:${name}`];
        const columnIndex = csv.headers.indexOf(header ?? "");
        return columnIndex < 0 ? [] : [{ name, header, columnIndex }];
    });
    if (!columns.length) throw new Error("Map at least one staff-hours column before reconciling.");

    const activeStaff = new Map(users.filter(user => user.role === "staff" || user.role === "manager")
        .map(user => [user.name.trim().toLocaleLowerCase(), user]));
    const rows: HistoricalHoursSourceRow[] = [];
    const months = new Set<string>();
    csv.rows.forEach((line, index) => {
        const businessDate = line[dateIndex]?.trim() ?? "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || !Number.isFinite(Date.parse(businessDate)) ||
            new Date(`${businessDate}T00:00:00Z`).toISOString().slice(0, 10) !== businessDate) {
            throw new Error(`Row ${index + 2}: business date must use YYYY-MM-DD.`);
        }
        months.add(businessDate.slice(0, 7));
        for (const column of columns) {
            const raw = line[column.columnIndex]?.trim() ?? "";
            if (!raw) continue;
            const hours = Number(raw.replace(/,/g, ""));
            if (!Number.isFinite(hours) || hours < 0 || hours > 24 || !Number.isInteger(hours * 3600)) {
                throw new Error(`Row ${index + 2}: hours for ${column.name} must be between 0 and 24 and resolve to whole seconds.`);
            }
            const user = activeStaff.get(column.name.trim().toLocaleLowerCase());
            rows.push({
                business_date: businessDate,
                staff_name: column.name,
                user_id: user?.id ?? null,
                hours,
                source_row: index + 2,
                source_column: column.header,
                uncertainty: null,
            });
        }
    });
    if (months.size !== 1) throw new Error("Reconcile one source month at a time.");
    if (!rows.length) throw new Error("The selected staff-hours columns contain no hour values.");
    return { sourceFile: `${fileName} (${[...months][0]})`, rows };
}
