import { apiRequest, setToken } from "./client";

export type Account = {
    id: number;
    name: string;
    email: string;
    role: "staff" | "manager";
    has_password: boolean;
    google_connected: boolean;
};

export type ShiftPunch = {
    user_id: number;
    name: string;
    clock_in: number;
    clock_out: number | null;
};

export type ShiftReport = {
    id: number;
    business_date: string;
    status: "open" | "closed";
    operation?: "started" | "joined" | "reopened";
    opened_at: number;
    closed_at: number | null;
    opened_by: string;
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

type Session = { token: string; user: Account };

export const accountApi = {
    status: () =>
        apiRequest<{ has_accounts: boolean; google_enabled: boolean }>("/auth/status"),

    me: () => apiRequest<Account>("/auth/me"),

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

    updateMe: (body: { name?: string; password?: string }) =>
        apiRequest<Account>("/auth/me", { method: "PATCH", body }),

    listUsers: () => apiRequest<Account[]>("/users"),

    staffDrinkRecipients: () => apiRequest<{ id: number; name: string }[]>("/users/recipients"),

    createUser: (body: {
        name: string;
        email: string;
        role: "staff" | "manager";
        password?: string;
    }) => apiRequest<Account>("/users", { method: "POST", body }),

    removeUser: (userId: number) => apiRequest<Account[]>(`/users/${userId}`, { method: "DELETE" }),

    currentShift: () => apiRequest<ShiftReport | null>("/shifts/current"),

    openShift: () => apiRequest<ShiftReport>("/shifts/open", { method: "POST" }),

    reopenShift: (shiftId: number, reason: string) => apiRequest<ShiftReport>(`/shifts/${shiftId}/reopen`, {
        method: "POST", body: { confirmed: true, reason },
    }),

    closeShift: () => apiRequest<ShiftReport>("/shifts/close", { method: "POST" }),

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

    shiftHistory: () => apiRequest<ShiftReport[]>("/shifts"),
};
