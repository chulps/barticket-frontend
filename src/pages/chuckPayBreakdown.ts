import type { ChuckMonthlyPayPreview } from "../api/account";

/** Read-only presentation: never infer paid status or deduplicate ledger records by amount. */
export function buildChuckPayBreakdown(report: ChuckMonthlyPayPreview) {
    const staff = report.staff_owed.map(row => ({
        id: row.user_id, name: row.name, wages: row.wages_yen,
        drinks: row.staff_drink_bonus_yen, total: row.total_owed_yen,
    }));
    const staffSum = staff.every(row => row.total !== null)
        ? staff.reduce((sum, row) => sum + (row.total ?? 0), 0) : null;
    const deductionSum = report.deductions.reduce((sum, row) => sum + row.amount_yen, 0);
    const reconciled = report.gross_salary_yen !== null && report.staff_cost_total_yen !== null &&
        staffSum === report.staff_cost_total_yen && deductionSum === report.deduction_total_yen &&
        report.net_amount_owed_yen !== null && report.net_amount_owed_yen >= 0 &&
        report.gross_salary_yen - report.staff_cost_total_yen - report.deduction_total_yen === report.net_amount_owed_yen;
    return {
        staff,
        retained: report.complete && reconciled ? report.net_amount_owed_yen : null,
        inconsistent: report.complete && !reconciled,
        deductions: report.deductions,
    };
}
