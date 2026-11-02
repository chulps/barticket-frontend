import type { Account, ChuckMonthlyPayPreview, PayCoverage, PersonalEarningsPreview } from "../api/account";

export type PayRow = {
    person: Account;
    wages: number | null;
    bonus: number | null;
    total: number | null;
    gross: number | null;
    staffCost: number | null;
    deductions: number | null;
    owed: number | null;
    complete: boolean;
    message?: string;
    chuck?: ChuckMonthlyPayPreview;
};

function amount(value: unknown): number | null {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/** Legacy `complete` describes recorded inputs, not final monthly coverage. */
function finalCoverage(data: PayCoverage): boolean {
    return data.staff_drink_data_status === "complete" &&
        data.final_pay_complete === true && data.recorded_inputs_only === false;
}

export function staffPayRow(person: Account, data: PersonalEarningsPreview): PayRow {
    const wages = data.categories.find(item => item.category === "hourly_wages");
    const drinks = data.categories.find(item => item.category === "staff_drink_bonus");
    const wageValue = amount(wages?.amount_yen_unrounded);
    const bonusValue = amount(drinks?.amount_yen);
    const wagesComplete = wages?.complete === true && wageValue !== null;
    const drinksComplete = Boolean(drinks?.complete && finalCoverage(drinks) && bonusValue !== null);
    const complete = wagesComplete && drinksComplete && finalCoverage(data);
    const drinkStatus = data.staff_drink_data_status === "incomplete" || drinks?.staff_drink_data_status === "incomplete"
        ? "incomplete" : "unknown";
    let message: string | undefined;
    if (!complete) {
        if (!wagesComplete && !drinksComplete) message = "wages_and_drinks_unverified";
        else if (!wagesComplete) message = "wages_unverified";
        else if (!drinksComplete) message = `drinks_${drinkStatus}`;
        else message = "pay_coverage_unverified";
    }
    // Recorded components remain useful even when the full month is not verified.
    const total = complete ? wageValue! + bonusValue! : null;
    return {
        person, wages: wageValue, bonus: bonusValue, total,
        gross: null, staffCost: null, deductions: null, owed: total, complete, message,
    };
}

export function managerPayRow(person: Account, data: ChuckMonthlyPayPreview): PayRow {
    const net = amount(data.net_amount_owed_yen);
    const complete = data.complete === true && finalCoverage(data) && net !== null && data.blockers.length === 0;
    return {
        person, wages: null, bonus: null, total: null,
        gross: amount(data.gross_salary_yen),
        staffCost: amount(data.recorded_staff_cost_total_yen ?? data.staff_cost_total_yen),
        deductions: amount(data.deduction_total_yen),
        owed: complete ? net : null, complete,
        message: complete ? undefined : data.blockers.length ? data.blockers.join(", ")
            : data.staff_drink_data_status === "incomplete" ? "drinks_incomplete" : "pay_coverage_unverified",
        chuck: data,
    };
}

export function totalStaffPay(rows: PayRow[]): number | null {
    const staff = rows.filter(row => row.person.role === "staff");
    return staff.length && staff.every(row => row.complete && row.owed !== null)
        ? staff.reduce((sum, row) => sum + row.owed!, 0) : null;
}
