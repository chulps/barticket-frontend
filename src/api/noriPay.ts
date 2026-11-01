import { apiRequest } from "./client";

export type NoriPayee = "chuck" | "haruka" | "kanata";
export type NoriMonthlyPay = {
    user_id: number;
    month: string;
    preview_only: true;
    own_income: {
        amount_yen: number | null;
        status: "estimate" | "incomplete" | "unavailable";
        blockers: string[];
        source: "monthly_revenue_less_recorded_staff_earnings" | null;
        basis?: "before_other_expenses";
        note?: string;
        complete?: boolean;
        revenue_yen?: number | null;
        staff_earnings_yen?: number | null;
        chuck_net_earnings_yen?: number | null;
        hourly_staff_earnings_yen?: number | null;
        recorded_staff_tips_commissions_yen?: number | null;
        other_manager_deductions_excluded_yen?: number;
    };
    staff_owed: {
        payee: NoriPayee;
        user_id: number | null;
        name: string | null;
        amount_yen: number | null;
        status: "estimate" | "incomplete" | "unavailable";
        blockers: string[];
        source: "chuck_monthly_pay_preview" | "personal_earnings_preview" | null;
    }[];
    payment_records_available: false;
    coverage: "recorded_inputs_only";
    note: string;
};

/** Self-only endpoint: never accepts an employee ID or calculates compensation. */
export const getNoriMonthlyPay = (month: string) =>
    apiRequest<NoriMonthlyPay>(`/profile/nori-monthly-pay?month=${encodeURIComponent(month)}`);
