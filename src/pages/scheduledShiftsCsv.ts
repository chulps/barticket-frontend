import type { Account } from "../api/account";
import type { ScheduleSourceRow, ScheduledPerson } from "../api/scheduledShifts";
import type { CsvData } from "./reconciliationCsv";

export type ScheduleCsvMapping = {
    date: string;
    manager: string;
    staffNames: string;
    staffColumns: string[];
    event: string;
    uncertainty: string;
};

const normalizeHeader = (value: string) => value.toLocaleLowerCase().replace(/[^a-z]/g, "");

export function defaultScheduleMapping(headers: readonly string[], users: Account[]): ScheduleCsvMapping {
    const find = (aliases: string[]) => headers.find(header => aliases.includes(normalizeHeader(header))) ?? "";
    const knownNames = new Set(users.map(user => normalizeHeader(user.name)));
    return {
        date: find(["date", "shiftdate", "businessdate"]),
        manager: find(["manager", "managername"]),
        staffNames: find(["staff", "staffname", "employee", "assignedstaff"]),
        staffColumns: headers.filter(header => knownNames.has(normalizeHeader(header))),
        event: find(["event", "eventvalue"]),
        uncertainty: find(["uncertainty", "notes", "scheduleuncertainty"]),
    };
}

function mappedPerson(name: string, users: Account[], role?: "manager"): ScheduledPerson {
    const normalized = name.trim().toLocaleLowerCase();
    const user = users.find(person => person.name.trim().toLocaleLowerCase() === normalized && (!role || person.role === role));
    return { name: name.trim(), user_id: user?.id ?? null };
}

function isBusinessDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
    return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function namesFromCell(value: string): string[] {
    return value.split(/[;|\n\r]+/).map(name => name.trim()).filter(Boolean);
}

/** Build only schedule fields. Spreadsheet hours are never read or submitted here. */
export function buildScheduleBatch(
    csv: CsvData,
    mapping: ScheduleCsvMapping,
    users: Account[],
    sourceFile: string,
): { sourceFile: string; rows: ScheduleSourceRow[] } {
    const dateIndex = csv.headers.indexOf(mapping.date);
    if (dateIndex < 0) throw new Error("Map the business date column before reviewing schedules.");
    const managerIndex = mapping.manager ? csv.headers.indexOf(mapping.manager) : -1;
    const staffNamesIndex = mapping.staffNames ? csv.headers.indexOf(mapping.staffNames) : -1;
    const staffColumnIndices = mapping.staffColumns.map(header => ({ header, index: csv.headers.indexOf(header) }))
        .filter(item => item.index >= 0);
    const eventIndex = mapping.event ? csv.headers.indexOf(mapping.event) : -1;
    const uncertaintyIndex = mapping.uncertainty ? csv.headers.indexOf(mapping.uncertainty) : -1;
    if (managerIndex < 0 && staffNamesIndex < 0 && staffColumnIndices.length === 0) {
        throw new Error("Map a manager, assigned staff names, or staff assignment columns.");
    }

    const months = new Set<string>();
    const rows: ScheduleSourceRow[] = [];
    csv.rows.forEach((line, index) => {
        const businessDate = line[dateIndex]?.trim() ?? "";
        if (!isBusinessDate(businessDate)) throw new Error(`Row ${index + 2}: business date must use YYYY-MM-DD.`);
        months.add(businessDate.slice(0, 7));
        const managerName = managerIndex >= 0 ? line[managerIndex]?.trim() ?? "" : "";
        const manager = managerName ? mappedPerson(managerName, users, "manager") : null;
        const names = staffNamesIndex >= 0 ? namesFromCell(line[staffNamesIndex]?.trim() ?? "") : [];
        for (const item of staffColumnIndices) {
            if ((line[item.index]?.trim() ?? "") !== "") names.push(item.header.trim());
        }
        const seenNames = new Set<string>();
        const staff = names.filter(name => {
            const key = name.toLocaleLowerCase();
            if (seenNames.has(key)) return false;
            seenNames.add(key);
            return true;
        }).map(name => mappedPerson(name, users));
        if (!manager && !staff.length) return;
        if (manager && staff.some(person => person.name.toLocaleLowerCase() === manager.name.toLocaleLowerCase())) {
            throw new Error(`Row ${index + 2}: the manager is also listed as assigned staff.`);
        }
        rows.push({
            business_date: businessDate,
            manager,
            staff,
            event_value: eventIndex >= 0 ? (line[eventIndex]?.trim() || null) : null,
            source_row: index + 2,
            uncertainty: uncertaintyIndex >= 0 ? (line[uncertaintyIndex]?.trim() || null) : null,
        });
    });
    if (months.size !== 1) throw new Error("Review one source month at a time.");
    if (!rows.length) throw new Error("No rows with a manager or assigned staff were found.");
    return { sourceFile, rows };
}
