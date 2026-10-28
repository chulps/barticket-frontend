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

export type PersonalWorkHistory = {
    user_id: number;
    coverage: {
        hours_source: "clock_punches_only";
        historical_hours: "not_imported";
        staff_drink_attribution: "verified_staff_id_only";
        unattributed_staff_drinks: "excluded_pending_review";
        compensation: "not_available";
    };
    shifts: {
        shift_id: number;
        business_date: string;
        status: "open" | "closed";
        hours_seconds: number | null;
        hours_state: "recorded" | "in_progress" | "incomplete" | "unavailable";
        clocked_in: boolean;
        drinks: { name: string; quantity: number }[];
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

    workHistory: () => apiRequest<PersonalWorkHistory>("/profile/work-history"),

    openShift: () => apiRequest<ShiftReport>("/shifts/open", { method: "POST" }),

    reopenShift: (shiftId: number, reason: string) => apiRequest<ShiftReport>(`/shifts/${shiftId}/reopen`, {
        method: "POST", body: { confirmed: true, reason },
    }),

    closeShift: () => apiRequest<ShiftReport>("/shifts/close", { method: "POST" }),

    clockIn: () => apiRequest<ShiftReport>("/shifts/clock-in", { method: "POST" }),

    clockOut: () => apiRequest<ShiftReport>("/shifts/clock-out", { method: "POST" }),

    closedShifts: () => apiRequest<ShiftReport[]>("/analytics/shifts"),

    shiftHistory: () => apiRequest<ShiftReport[]>("/shifts"),
};
