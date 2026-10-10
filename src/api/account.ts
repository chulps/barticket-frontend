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
    punches: ShiftPunch[];
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

    createUser: (body: {
        name: string;
        email: string;
        role: "staff" | "manager";
        password?: string;
    }) => apiRequest<Account>("/users", { method: "POST", body }),

    currentShift: () => apiRequest<ShiftReport | null>("/shifts/current"),

    openShift: () => apiRequest<ShiftReport>("/shifts/open", { method: "POST" }),

    closeShift: () => apiRequest<ShiftReport>("/shifts/close", { method: "POST" }),

    clockIn: () => apiRequest<ShiftReport>("/shifts/clock-in", { method: "POST" }),

    clockOut: () => apiRequest<ShiftReport>("/shifts/clock-out", { method: "POST" }),

    closedShifts: () => apiRequest<ShiftReport[]>("/analytics/shifts"),
};
