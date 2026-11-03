import { apiRequest } from "./client";

export type TimeOffRequest = {
  id: number;
  scheduled_shift_id: number;
  requester_user_id: number;
  requester_name: string;
  manager_user_id: number;
  business_date: string;
  reason: string | null;
  status: "pending" | "approved" | "declined" | "invalidated";
  revision: number;
  schedule_revision: string;
  created_at: string;
  decided_at: string | null;
};

export type TimeOffInboxItem = {
  id: number;
  request: TimeOffRequest;
  kind: "request" | "decision" | "reassigned";
  is_read: boolean;
  created_at: string;
};

export const timeOffApi = {
  requests: () => apiRequest<TimeOffRequest[]>("/time-off/requests"),
  request: (requestId: number) => apiRequest<TimeOffRequest>(`/time-off/requests/${requestId}`),
  submit: (scheduled_shift_id: number, reason: string) => apiRequest<TimeOffRequest>("/time-off/requests", {
    method: "POST", body: { scheduled_shift_id, reason: reason.trim() || null },
  }),
  decide: (requestId: number, decision: "approve" | "decline", expected_revision: number, expected_schedule_revision: string) =>
    apiRequest<TimeOffRequest>(`/time-off/requests/${requestId}/${decision}`, {
      method: "POST", body: { expected_revision, expected_schedule_revision },
    }),
  inbox: () => apiRequest<TimeOffInboxItem[]>("/time-off/inbox"),
  markRead: (notificationId: number) => apiRequest<{ id: number; is_read: boolean }>(`/time-off/inbox/${notificationId}/read`, { method: "POST" }),
};
