import type { ShiftPunch, ShiftReport } from "../api/account";

/**
 * Read-only view of *currently recorded* data. Historical imported hours and
 * private compensation will be handled by the dedicated backend contract.
 * Never associate records based on a display name.
 */
export type StaffActivityRow = {
    shiftId: number;
    businessDate: string;
    status: "open" | "closed";
    hoursSeconds: number | null;
    hoursState?: "recorded" | "in_progress" | "incomplete" | "unavailable";
    clockedIn: boolean;
    punches: ShiftPunch[];
    drinks: { name: string; quantity: number }[];
};

export function buildStaffActivity(
    userId: number,
    closedShifts: ShiftReport[],
    currentShift: ShiftReport | null,
): StaffActivityRow[] {
    const uniqueShifts = new Map<number, ShiftReport>();
    for (const shift of closedShifts) {
        if (shift.status === "closed") uniqueShifts.set(shift.id, shift);
    }
    // The live response supersedes an older snapshot of the same shift.
    if (currentShift?.status === "open") uniqueShifts.set(currentShift.id, currentShift);

    const rows: StaffActivityRow[] = [];
    for (const shift of uniqueShifts.values()) {
        const hours = (shift.staff_hours ?? []).filter(record => record.user_id === userId);
        const punches = (shift.punches ?? []).filter(record => record.user_id === userId);
        const drinks = (shift.staff_drinks ?? [])
            .filter(record => record.staff_id === userId && record.quantity > 0)
            .map(record => ({ name: record.drink_name, quantity: record.quantity }));
        // No name matching: historical or unidentified recipients stay unmatched.
        if (!hours.length && !punches.length && !drinks.length) continue;

        rows.push({
            shiftId: shift.id,
            businessDate: shift.business_date,
            status: shift.status,
            // Missing staff_hours is *unknown*, even if another record is present.
            hoursSeconds: hours.length
                ? hours.reduce((seconds, record) => seconds + Math.max(0, record.seconds), 0)
                : null,
            clockedIn: shift.status === "open" && punches.some(record => record.clock_out === null),
            punches,
            drinks,
        });
    }
    return rows.sort((a, b) =>
        b.businessDate.localeCompare(a.businessDate) || b.shiftId - a.shiftId,
    );
}

export function recordedStaffTotals(rows: StaffActivityRow[]) {
    const hourRows = rows.filter(row => row.hoursSeconds !== null);
    const drinkRows = rows.filter(row => row.drinks.length > 0);
    return {
        recordedShifts: rows.length,
        hoursSeconds: hourRows.length
            ? hourRows.reduce((seconds, row) => seconds + (row.hoursSeconds ?? 0), 0)
            : null,
        hoursShifts: hourRows.length,
        drinkCount: drinkRows.length
            ? drinkRows.reduce((count, row) =>
                count + row.drinks.reduce((quantity, drink) => quantity + drink.quantity, 0), 0)
            : null,
        drinksShifts: drinkRows.length,
    };
}
