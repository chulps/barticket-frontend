import type { ChuckMonthlyPayPreview } from "../api/account";

/** Older servers may return a numeric balance alongside incomplete inputs. */
export function chuckPayDisplay(report: Pick<ChuckMonthlyPayPreview, "complete" | "net_amount_owed_yen" | "blockers">) {
    return {
        netAmount: report.complete ? report.net_amount_owed_yen : null,
        staffSubtotalPartial: report.blockers.some(code => [
            "staff_hours_unverified", "staff_hourly_rate_missing", "unattributed_staff_drink",
            "unassigned_staff_history", "staff_payroll_costs_incomplete",
        ].includes(code)),
    };
}
