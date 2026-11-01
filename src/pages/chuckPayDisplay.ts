import type { ChuckMonthlyPayPreview } from "../api/account";

/** Older servers may return a numeric balance alongside incomplete inputs. */
export function chuckPayDisplay(report: Pick<ChuckMonthlyPayPreview, "complete" | "net_amount_owed_yen" | "blockers" | "staff_drink_data_status">) {
    const drinksIncomplete = report.staff_drink_data_status === "incomplete" || report.blockers.includes("staff_drink_data_incomplete");
    return {
        netAmount: report.complete && !drinksIncomplete ? report.net_amount_owed_yen : null,
        staffSubtotalPartial: drinksIncomplete || report.blockers.some(code => [
            "staff_hours_unverified", "staff_hourly_rate_missing", "unattributed_staff_drink",
            "unassigned_staff_history", "staff_payroll_costs_incomplete",
        ].includes(code)),
    };
}
