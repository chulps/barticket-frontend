import type { Account } from "../api/account";
import type { HistoricalHoursSourceRow } from "../api/historicalHours";
import type { CsvData } from "./reconciliationCsv";

export function buildHistoricalHoursBatch(
    csv: CsvData,
    mapping: Record<string, string>,
    users: Account[],
    fileName: string,
): { sourceFile: string; rows: HistoricalHoursSourceRow[] } {
    const dateIndex = csv.headers.indexOf(mapping.date ?? "");
    if (dateIndex < 0) throw new Error("Map the business date column before reconciling staff hours.");
    const staffIndex = csv.headers.indexOf(mapping.staff ?? "");
    const hoursIndex = csv.headers.indexOf(mapping.hours ?? "");
    if (staffIndex < 0) throw new Error("Map the staff-name column before reconciling staff hours.");
    if (hoursIndex < 0) throw new Error("Map the total-hours column before reconciling staff hours.");

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
        const raw = line[hoursIndex]?.trim() ?? "";
        if (!raw) return;
        const hours = Number(raw.replace(/,/g, ""));
        if (!Number.isFinite(hours) || hours < 0 || hours > 24 || !Number.isInteger(hours * 3600)) {
            throw new Error(`Row ${index + 2}: staff hours must be between 0 and 24 and resolve to whole seconds.`);
        }
        const sourceName = line[staffIndex]?.trim() ?? "";
        const staffName = sourceName && sourceName.toLocaleLowerCase() !== "none" ? sourceName : "Unassigned staff";
        const user = activeStaff.get(staffName.trim().toLocaleLowerCase());
        rows.push({
            business_date: businessDate,
            staff_name: staffName,
            user_id: user?.id ?? null,
            hours,
            source_row: index + 2,
            source_column: csv.headers[hoursIndex],
            uncertainty: null,
        });
    });
    if (months.size !== 1) throw new Error("Reconcile one source month at a time.");
    if (!rows.length) throw new Error("The selected staff-hours columns contain no hour values.");
    return { sourceFile: `${fileName} (${[...months][0]})`, rows };
}
