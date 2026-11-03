import { apiRequest } from "./client";

export type Reservation = {
    id: number;
    reference: string;
    business_date: string;
    arrival_at: string;
    guest_name: string;
    party_size: number;
    contact_email: string | null;
    contact_phone: string | null;
    note: string | null;
    note_translation: string | null;
    note_translation_language: "en" | "ja" | null;
    note_translation_status: "not_requested" | "pending" | "translated" | "unavailable";
    manager_user_id: number | null;
    status: "pending" | "approved" | "declined" | "canceled";
    revision: number;
    created_at: string;
    updated_at: string;
    decided_at: string | null;
    email_status?: "accepted" | "failed" | "unknown" | "sending" | "queued" | "superseded" | "not_requested" | "not_enabled";
};

export type ReservationInbox = {
    notifications: { id: number; reservation_id: number; is_read: boolean; created_at: string }[];
    pending_requests: Reservation[];
};

export const reservationsApi = {
    list: (dateFrom: string, dateTo: string) =>
        apiRequest<Reservation[]>(`/reservations?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`),
    request: (id: number) => apiRequest<Reservation>(`/reservations/requests/${id}`),
    inbox: () => apiRequest<ReservationInbox>("/reservations/inbox"),
    decide: (id: number, decision: "approve" | "decline" | "cancel", expected_revision: number) =>
        apiRequest<Reservation>(`/reservations/requests/${id}/${decision}`, { method: "POST", body: { expected_revision } }),
    retryEmail: (id: number) => apiRequest<Reservation>(`/reservations/requests/${id}/retry-email`, { method: "POST" }),
    dispatchQueuedEmail: () => apiRequest<{ scanned: number; accepted: number; failed: number; unknown: number; superseded: number }>("/reservations/outbox/dispatch", { method: "POST" }),
    markRead: (id: number) => apiRequest<{ ok: boolean }>(`/reservations/inbox/${id}/read`, { method: "POST" }),
};
