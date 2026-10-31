export type AnalyticsShiftIndex = { id: number | null; business_date: string; status: "open" | "closed" | null };
export type AnalyticsDateScope = { date_from?: string; date_to?: string };
import type { RevenueSharePolicy } from "./revenueSharePolicy";
import { apiRequest, getToken, setToken } from "./client";
import { createSessionRead } from "./sessionRead";

export type Account = {
    id: number;
    name: string;
    email: string;
    role: "staff" | "manager";
    has_password: boolean;
    google_connected: boolean;
};

export type ShiftPunch = {
    id: number;
    user_id: number;
    name: string;
    clock_in: number;
    clock_out: number | null;
    recorded_clock_in: number;
    recorded_clock_out: number | null;
    clock_out_source: string | null;
    clock_out_by: string | null;
    clock_out_reason: string | null;
    correction_history?: {
        correction_id: number;
        field: "clock_in" | "clock_out";
        previous_at: number;
        corrected_at: number;
        reason: string;
        corrected_by: string;
        corrected_by_user_id: number;
        created_at: number;
    }[];

};

export type ShiftManagerAudit = {
    id: number;
    previous_manager_user_id: number | null;
    previous_manager_name: string | null;
    new_manager_user_id: number | null;
    new_manager_name: string | null;
    changed_at: number;
    changed_by: string;
    reason: string;
};

export type AdminAuditEvent = {
    occurred_at: string;
    action: string;
    entity_type: string;
    entity_id: number | null;
    actor_name: string;
    subject_name: string;
    reason: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
};

export type RevenueSharePreview = {
    policy?: RevenueSharePolicy;
    month: string;
    beneficiary_user_id: number;
    preview_only: true;
    working_manager_shift_ids: number[];
    working_manager_revenue_known_yen: number;
    eligible_revenue_yen: number | null;
    revenue_source: "service_shift_payments_deferred_billed_total_or_shift_summary_preview";
    tier_rate_percent: number | null;
    tier_rate_basis: "service_shift_sales_preview" | null;
    tier_application_method: "flat_monthly_confirmed";
    gross_share_rounding: "nearest_yen_half_up";
    next_tier: { rate_percent: number; threshold_yen: number; remaining_yen: number } | null;
    gross_share_yen: number | null;
    unassigned_shift_ids: number[];
    open_working_manager_shift_ids: number[];
    recorded_shift_count: number;
    complete: boolean;
    payable_yen: number | null;
    costs: {
        staff_base_wages_yen: number | null;
        staff_drinkback_yen: number | null;
        deductions_yen: number | null;
        approved_additions_yen: number | null;
    };
    blockers: string[];
};

export type StaffDrinkBonusReport = {
    period: { date_from: string; date_to: string };
    preview_only: true;
    policy: {
        basis: "listed_price";
        rate_percent: 40;
        eligibility: "staff_linked_drinks_on_fully_paid_tickets";
        applies_to_historical_paid_staff_drinks: true;
        rounding: "nearest_yen_half_up_per_staff_shift";
    };
    items: {
        staff_id: number | null;
        staff_name: string;
        business_date: string;
        shift_id: number | null;
        recorded_line_count: number;
        recorded_units: number;
        eligible_line_count: number;
        eligible_units: number;
        eligible_listed_revenue_yen: number;
        bonus_rate_percent: 40;
        bonus_yen: number;
        calculated_bonus_yen?: number;
        manual_adjustment_yen?: number;
    }[];
    lines: {
        staff_id: number | null;
        staff_name: string;
        business_date: string;
        shift_id: number | null;
        ticket_id: number;
        drink_id: number;
        drink_name: string;
        quantity: number;
        unit_price_yen: number;
        listed_revenue_yen: number;
        ticket_fully_paid: boolean;
        eligible: boolean;
        exclusion_reason: string | null;
    }[];
    totals: {
        recorded_line_count: number;
        recorded_units: number;
        eligible_units: number;
        eligible_listed_revenue_yen: number;
        bonus_yen: number;
        calculated_bonus_yen?: number;
        manual_adjustment_yen?: number;
    };
    adjustments?: {
        id: number;
        staff_id: number;
        staff_name: string;
        business_date: string;
        shift_id: number;
        signed_amount_yen: number;
        reason: string;
        reversal_of_id: number | null;
        created_by_name: string;
        created_at: string;
    }[];
    note: string;
};

export type ShiftReport = {
    id: number;
    business_date: string;
    status: "open" | "closed";
    operation?: "started" | "joined" | "reopened";
    opened_at: number;
    closed_at: number | null;
    opened_by: string;
    working_manager_user_id?: number | null;
    working_manager_name?: string | null;
    closed_by: string | null;
    paid_total: number;
    cash_total: number;
    card_total: number;
    other_total: number;
    cover_total: number;
    guest_count: number;
    paid_count: number;
    cancelled_count: number;
    receivable_count?: number;
    receivable_billed_total?: number;
    receivable_collected_total?: number;
    receivable_outstanding_total?: number;
    staff_hours: { user_id: number; name: string; seconds: number }[];
    staff_drinks?: { ticket_id: number; staff_id: number | null; staff_name: string; menu_item_id: number | null; drink_name: string; price_key: string; unit_price: number; quantity: number; revenue: number }[];
    stockouts?: { item: string; at: number; by: string }[];
    punches: ShiftPunch[];
    reopen_history?: {
        id: number;
        reopened_at: number;
        reopened_by: string;
        reason: string;
        previous_closed_at: number;
        previous_closed_by: string | null;
        previous_paid_total: number;
        previous_cash_total: number;
        previous_card_total: number;
        previous_other_total: number;
        previous_cover_total: number;
        previous_guest_count: number;
        previous_paid_count: number;
        previous_cancelled_count: number;
    }[];
};

/** Analytics includes closure-only days that do not have a staff shift. */
export type AnalyticsShiftReport = Omit<ShiftReport, "id" | "status" | "opened_at" | "opened_by"> & {
    id: number | null;
    status: "open" | "closed" | null;
    shift_status?: "open" | "closed" | null;
    venue_status?: "open" | "closed";
    venue_event?: string | null;
    opened_at: number | null;
    opened_by: string | null;
};

export type ServiceSalesByDate = {
    business_date: string;
    ticket_count: number;
    guest_count: number;
    original_billed_total: number;
};

export type ServiceSalesReport = {
    basis: "original_service_business_date";
    label: string;
    items: ServiceSalesByDate[];
};

export type VenueStatus = {
    business_date: string;
    status: "open" | "closed";
    event_value: string | null;
    updated_by: string | null;
    updated_at: string | null;
};

export type PersonalWorkHistory = {
    user_id: number;
    coverage: {
        hours_source: "clock_punches_and_verified_historical_totals";
        historical_hours: "verified_date_totals_included";
        staff_drink_attribution: "verified_staff_id_only";
        unattributed_staff_drinks: "excluded_pending_review";
        compensation: "not_available";
    };
    shifts: {
        shift_id: number | null;
        business_date: string;
        status: "open" | "closed" | null;
        hours_seconds: number | null;
        historical_hours_seconds: number | null;
        hours_basis: "clock" | "spreadsheet" | "spreadsheet_authoritative" | "clock_plus_spreadsheet";
        hours_state: "recorded" | "in_progress" | "incomplete" | "unavailable";
        clocked_in: boolean;
        drinks: { name: string; quantity: number }[];
    }[];
};

export type PersonalEarningsPreview = {
    user_id: number;
    month: string;
    preview_only: true;
    categories: (
        | {
            category: "hourly_wages";
            amount_yen_unrounded: string | null;
            complete: boolean;
            entries: {
                business_date: string;
                amount_yen_unrounded: string | null;
                hours_seconds: number;
                hourly_rate_yen: number | null;
                hours_basis: string;
            }[];
        }
        | {
            category: "staff_drink_bonus";
            amount_yen: number;
            complete: boolean;
            entries: {
                business_date: string;
                shift_id: number | null;
                eligible_units: number;
                eligible_listed_revenue_yen: number;
                rate_percent: number;
                amount_yen: number;
            }[];
        }
    )[];
    note: string;
};

export type ChuckMonthlyPayPreview = {
    user_id: number;
    month: string;
    preview_only: true;
    complete: boolean;
    gross_salary_yen: number | null;
    tier_rate_percent: number | null;
    eligible_revenue_yen: number | null;
    revenue_shift_ids: number[];
    staff_owed: {
        user_id: number;
        name: string;
        wages_yen: number | null;
        staff_drink_bonus_yen: number;
        total_owed_yen: number | null;
        hours: {
            business_date: string;
            shift_id: number | null;
            hours_seconds: number;
            hourly_rate_yen: number | null;
            hours_basis: string;
            amount_yen_unrounded: string | null;
        }[];
    }[];
    staff_cost_total_yen: number | null;
    deductions: {
        id: number;
        category: "language_exchange_commission" | "manager_paid_staff_tip" | "manager_pay_deduction" | "staff_drink_bonus_adjustment";
        business_date: string;
        shift_id: number | null;
        amount_yen: number;
        payee_name: string;
        reason: string;
        reversal_of_id: number | null;
    }[];
    deduction_total_yen: number;
    net_amount_owed_yen: number | null;
    calculated_balance_yen: number | null;
    blockers: string[];
    note: string;
};

export type HourlyRateRecord = {
    id: number;
    hourly_rate_yen: number;
    effective_from: string;
    effective_through: string | null;
    reason: string;
    source: string | null;
    changed_by_user_id: number;
    changed_by_name: string;
    created_at: string;
};
export type HourlyRatePreview = {
    user_id: number;
    staff_name: string;
    effective_from: string;
    period_end: string | null;
    proposed_hourly_rate_yen: number;
    affected_hours_seconds: number;
    current_gross_estimate_yen_unrounded: string | null;
    proposed_gross_estimate_yen_unrounded: string;
    change_yen_unrounded: string | null;
    hours_basis?: string;
    note: string;
};
type HourlyRateChange = {
    user_id: number;
    hourly_rate_yen: number;
    effective_from: string;
    reason: string;
    source?: string;
};

export type ManagerPayDeduction = {
    id: number;
    beneficiary_user_id: number;
    category: "language_exchange_commission" | "manager_paid_staff_tip" | "manager_pay_deduction";
    signed_amount_yen: number;
    business_date: string;
    shift_id: number | null;
    payee_user_id: number | null;
    payee_name: string;
    reason: string;
    source: { file: string | null; row: number | null; column: string | null; note: string | null };
    reversal_of_id: number | null;
    created_by_user_id: number;
    created_by_name: string;
    created_at: string;
};

export type ManagerPayDeductionList = {
    period: { date_from: string; date_to: string };
    items: ManagerPayDeduction[];
    signed_deduction_total_yen: number;
    note: string;
};

type Session = { token: string; user: Account };

// A one-second handoff avoids serial duplicate auth reads as routes mount.
// Fresh focus/auth checks retire this snapshot before component listeners run.
const sessionAccount = createSessionRead(getToken, () => apiRequest<Account>("/auth/me"));
window.addEventListener("barticket-auth", sessionAccount.invalidate);
window.addEventListener("focus", sessionAccount.revalidate);
window.addEventListener("barticket-users-updated", sessionAccount.invalidate);

export const accountApi = {
    status: () =>
        apiRequest<{ has_accounts: boolean; google_enabled: boolean }>("/auth/status"),

    me: sessionAccount.read,

    async register(name: string, email: string, password: string) {
        const session = await apiRequest<Session>("/auth/register", {
            method: "POST",
            body: { name, email, password },
        });
        setToken(session.token);
        return session.user;
    },

    async login(email: string, password: string) {
        const session = await apiRequest<Session>("/auth/login", {
            method: "POST",
            body: { email, password },
        });
        setToken(session.token);
        return session.user;
    },

    async logout() {
        try {
            await apiRequest("/auth/logout", { method: "POST" });
        } finally {
            setToken(null);
        }
    },

    async updateMe(body: { name?: string; password?: string }) {
        sessionAccount.invalidate();
        try { return await apiRequest<Account>("/auth/me", { method: "PATCH", body }); }
        finally { sessionAccount.invalidate(); }
    },

    listUsers: () => apiRequest<Account[]>("/users"),

    staffDrinkRecipients: () => apiRequest<{ id: number; name: string }[]>("/users/recipients"),

    createUser: (body: {
        name: string;
        email: string;
        role: "staff" | "manager";
        password?: string;
    }) => apiRequest<Account>("/users", { method: "POST", body }),

    removeUser: (userId: number) => apiRequest<Account[]>(`/users/${userId}`, { method: "DELETE" }),

    hourlyRates: (userId: number) =>
        apiRequest<{ user_id: number; staff_name: string; hourly_rates: HourlyRateRecord[] }>(
            `/admin/staff-compensation/users/${userId}/hourly-rates`,
        ),

    previewHourlyRate: (body: Pick<HourlyRateChange, "user_id" | "hourly_rate_yen" | "effective_from">) =>
        apiRequest<HourlyRatePreview>("/admin/staff-compensation/hourly-rates/preview", {
            method: "POST", body,
        }),

    setHourlyRate: (body: HourlyRateChange) =>
        apiRequest<{ id: number; user_id: number; hourly_rate_yen: number; effective_from: string; reason: string; source: string | null; changed_by_name: string; created_at: string }>(
            "/admin/staff-compensation/hourly-rates",
            { method: "POST", body },
        ),

    currentShift: () => apiRequest<ShiftReport | null>("/shifts/current"),

    correctPunch: (
        shiftId: number,
        punchId: number,
        body: { corrected_clock_in: string; corrected_clock_out: string; reason: string },
    ) => apiRequest<ShiftReport>(`/shifts/${shiftId}/punches/${punchId}/corrections`, {
        method: "POST", body,
    }),

    venueStatus: (businessDate: string) =>
        apiRequest<VenueStatus>(`/venue-status?business_date=${encodeURIComponent(businessDate)}`),

    updateVenueStatus: (body: Pick<VenueStatus, "business_date" | "status" | "event_value">) =>
        apiRequest<VenueStatus>("/venue-status", { method: "PUT", body }),

    workHistory: () => apiRequest<PersonalWorkHistory>("/profile/work-history"),

    personalEarnings: (month: string) =>
        apiRequest<PersonalEarningsPreview>(`/profile/earnings?month=${encodeURIComponent(month)}`),

    chuckMonthlyPay: (month: string) =>
        apiRequest<ChuckMonthlyPayPreview>(`/profile/chuck-monthly-pay?month=${encodeURIComponent(month)}`),

    openShift: () => apiRequest<ShiftReport>("/shifts/open", { method: "POST" }),

    reopenShift: (shiftId: number, reason: string) => apiRequest<ShiftReport>(`/shifts/${shiftId}/reopen`, {
        method: "POST", body: { confirmed: true, reason },
    }),

    assignWorkingManager: (shiftId: number, managerUserId: number | null, reason: string) =>
        apiRequest<ShiftReport>(`/shifts/${shiftId}/working-manager`, {
            method: "PUT", body: { manager_user_id: managerUserId, reason },
        }),

    workingManagerHistory: (shiftId: number) =>
        apiRequest<ShiftManagerAudit[]>(`/shifts/${shiftId}/working-manager-history`),

    adminPersonalEarnings: (userId: number, month: string) =>
        apiRequest<PersonalEarningsPreview>(`/admin/staff-compensation/users/${userId}/earnings?month=${encodeURIComponent(month)}`),

    adminChuckMonthlyPay: (month: string) =>
        apiRequest<ChuckMonthlyPayPreview>(`/admin/staff-compensation/chuck-monthly-pay?month=${encodeURIComponent(month)}`),

    revenueSharePreview: (month: string) =>
        apiRequest<RevenueSharePreview>(`/payroll/revenue-share/preview?month=${encodeURIComponent(month)}`),

    managerPayDeductions: (params: { date_from: string; date_to: string; beneficiary_user_id: number }) =>
        apiRequest<ManagerPayDeductionList>(
            `/admin/payroll/deductions?date_from=${encodeURIComponent(params.date_from)}&date_to=${encodeURIComponent(params.date_to)}&beneficiary_user_id=${params.beneficiary_user_id}`,
        ),

    createManagerPayDeduction: (body: {
        beneficiary_user_id: number;
        category: ManagerPayDeduction["category"];
        amount_yen: number;
        business_date: string;
        payee_name: string;
        reason: string;
        source_file?: string;
        source_row?: number;
        source_column?: string;
        source_note?: string;
    }) => apiRequest<ManagerPayDeduction>("/admin/payroll/deductions", { method: "POST", body }),

    reverseManagerPayDeduction: (id: number, reason: string) =>
        apiRequest<ManagerPayDeduction>(`/admin/payroll/deductions/${id}/reverse`, { method: "POST", body: { reason } }),

    adminAuditHistory: (personUserId: number) =>
        apiRequest<{ person_user_id: number; events: AdminAuditEvent[]; has_more: boolean }>(
            `/admin/audit?person_user_id=${personUserId}&limit=200`,
        ),


    staffDrinkBonuses: (userId: number, dateFrom: string, dateTo: string) =>
        apiRequest<StaffDrinkBonusReport>(`/admin/staff-compensation/drink-bonuses?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&user_id=${userId}`),

    createStaffDrinkBonusAdjustment: (
        userId: number,
        body: { shift_id: number; signed_amount_yen: number; reason: string; idempotency_key?: string },
    ) => apiRequest<ManagerPayDeduction>(
        `/admin/staff-compensation/users/${userId}/drink-bonus-adjustments`,
        { method: "POST", body },
    ),

    reverseStaffDrinkBonusAdjustment: (id: number, reason: string) =>
        apiRequest<ManagerPayDeduction>(
            `/admin/staff-compensation/drink-bonus-adjustments/${id}/reverse`,
            { method: "POST", body: { reason } },
        ),

    closeShift: (shiftId: number) => apiRequest<ShiftReport>(`/shifts/${shiftId}/close`, { method: "POST" }),

    keepShiftOpen: (shiftId: number, reason: string) => apiRequest<ShiftReport>(`/shifts/${shiftId}/keep-open`, {
        method: "POST", body: { reason },
    }),

    closeReadiness: () => apiRequest<{
        shift: { id: number; business_date: string; status: "open" | "closed" } | null;
        can_close: boolean;
        blockers: { code: string; ticket_id?: number; name?: string; balance_due?: number; message: string }[];
        open_ticket_count: number;
        clocked_in_staff: { user_id: number; name: string; clock_in: number }[];
        automatic_clock_out: {
            will_clock_out_count: number;
            will_clock_out_staff: { user_id: number; name: string; clock_in: number }[];
            source: string;
        };
        manager_keep_open: boolean;
        manager_keep_open_history: { kept_open_at: number; kept_open_by: string; kept_open_by_user_id: number; reason: string }[];
        finalized_totals: { collected_total: number; cash_total: number; card_total: number; other_total: number };
        approved_carry_forwards: { ticket_id: number; name: string; reason: string; billed_total: number; collected_total: number; remaining_total: number }[];
        receivables: { count: number; billed_total: number; collected_total: number; outstanding_total: number };
    }>("/shifts/close-readiness"),

    clockIn: () => apiRequest<ShiftReport>("/shifts/clock-in", { method: "POST" }),

    clockOut: () => apiRequest<ShiftReport>("/shifts/clock-out", { method: "POST" }),

    closedShifts: () => apiRequest<ShiftReport[]>("/analytics/shifts"),

    analyticsShiftIndex: () => apiRequest<AnalyticsShiftIndex[]>("/analytics/shift-index"),

    analyticsShifts: (scope?: AnalyticsDateScope) => apiRequest<AnalyticsShiftReport[]>(
        scope?.date_from && scope?.date_to
            ? `/analytics/shifts?date_from=${encodeURIComponent(scope.date_from)}&date_to=${encodeURIComponent(scope.date_to)}`
            : "/analytics/shifts",
    ),

    serviceSales: (dateFrom: string, dateTo: string) => apiRequest<ServiceSalesReport>(
        `/analytics/service-sales?service_date_from=${encodeURIComponent(dateFrom)}&service_date_to=${encodeURIComponent(dateTo)}`,
    ),

    shiftHistory: () => apiRequest<ShiftReport[]>("/shifts"),
};

