import { apiRequest } from "./client";

export type NoriPayee = "chuck" | "haruka" | "kanata";
export type NoriMonthlyPay = {
    user_id: number;
    month: string;
    preview_only: true;
    own_income: {
        amount_yen: null;
        status: "unavailable";
        blockers: string[];
        source: null;
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
