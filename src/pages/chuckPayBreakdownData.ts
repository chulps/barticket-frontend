import type { ChuckMonthlyPayPreview } from "../api/account";

/** Read-only presentation: never infer paid status or deduplicate ledger records by amount. */
export function buildChuckPayBreakdown(report: ChuckMonthlyPayPreview) {
    const drinksIncomplete = report.staff_drink_data_status === "incomplete" || report.blockers?.includes("staff_drink_data_incomplete");
    const staff = report.staff_owed.map(row => ({
        id: row.user_id, name: row.name, wages: row.wages_yen,
        drinks: row.staff_drink_bonus_yen, total: drinksIncomplete && row.recorded_total_yen !== undefined ? row.recorded_total_yen : row.total_owed_yen,
    }));
    const componentsReconcile = staff.every(person => person.wages !== null && Number.isSafeInteger(person.wages) && Number.isSafeInteger(person.drinks) && Number.isSafeInteger(person.total) && person.wages + person.drinks === person.total);
    const staffSum = staff.every(row => row.total !== null)
        ? staff.reduce((sum, row) => sum + (row.total ?? 0), 0) : null;
    const deductionSum = report.deductions.reduce((sum, row) => sum + row.amount_yen, 0);
    const recordedStaffCost = drinksIncomplete && report.recorded_staff_cost_total_yen !== undefined ? report.recorded_staff_cost_total_yen : report.staff_cost_total_yen;
    const recordedInputsReconcile = componentsReconcile && staffSum === recordedStaffCost && deductionSum === report.deduction_total_yen &&
        [report.gross_salary_yen, recordedStaffCost, report.deduction_total_yen, ...report.deductions.map(row => row.amount_yen)].every(value => typeof value === "number" && Number.isSafeInteger(value));
    // Arithmetic on recorded inputs only. Never substitute for the verified API net.
    const recordedDifference = recordedInputsReconcile ? report.gross_salary_yen! - recordedStaffCost! - report.deduction_total_yen : null;
    const recordedRemaining = Number.isSafeInteger(recordedDifference) ? recordedDifference : null;
    const reconciled = report.gross_salary_yen !== null && report.staff_cost_total_yen !== null &&
        componentsReconcile && staffSum === report.staff_cost_total_yen && deductionSum === report.deduction_total_yen &&
        report.net_amount_owed_yen !== null && report.net_amount_owed_yen >= 0 &&
        report.gross_salary_yen - report.staff_cost_total_yen - report.deduction_total_yen === report.net_amount_owed_yen;
    return {
        staff,
        recordedStaffCost,
        recordedRemaining,
        retained: report.complete && !drinksIncomplete && reconciled ? report.net_amount_owed_yen : null,
        inconsistent: report.complete && !drinksIncomplete && !reconciled,
        deductions: report.deductions,
        // Unknown and signed components remain in details, never distorted into pie slices.
        staffSlices: componentsReconcile && staff.every(person => person.wages! >= 0 && person.drinks >= 0)
            ? staff.flatMap(person => [
                { id: `staff-${person.id}-wages`, name: person.name, kind: "wages" as const, value: person.wages! },
                { id: `staff-${person.id}-drinks`, name: person.name, kind: "drinks" as const, value: person.drinks },
            ]) : [],
    };
}
