import { apiRequest } from "./client";

export type ScheduledPerson = { name: string; user_id: number | null };
export type ScheduledShiftSource = {
    source_file: string;
    source_row: number;
    imported_by: string;
    imported_at: string;
    uncertainty: string | null;
};
export type ScheduledShift = {
    revision?: string;
    id: number;
    business_date: string;
    schedule_state: "upcoming" | "today" | "past";
    actual_shift_exists: boolean;
    actual_shift_status: "open" | "closed" | null;
    actual_shift_closed_at: string | null;
    venue_status: "open" | "closed" | null;
    venue_event: string | null;
    manager: ScheduledPerson | null;
    staff: ScheduledPerson[];
    event_value: string | null;
    schedule_type?: "open" | "event" | "closed";
    event_notes?: string | null;
    hours: null;
    provenance: ScheduledShiftSource[];
};
export type ScheduleContext = {
    operational_business_date: string;
    calendar_business_date: string;
    actual_shift_status: "open" | "closed" | null;
    actual_shift_business_date: string | null;
};
export type ScheduleSourceRow = {
    business_date: string;
    manager: ScheduledPerson | null;
    staff: ScheduledPerson[];
    event_value: string | null;
    source_row: number;
    uncertainty: string | null;
};
export type SchedulePreviewRow = ScheduleSourceRow & {
    status: "new" | "match" | "already_imported" | "unmapped" | "conflict";
    schedule_state: "upcoming" | "today" | "past";
    actual_shift_exists: boolean;
    problems: string[];
};
export type SchedulePreview = {
    mode: "READ_ONLY_SCHEDULE_RECONCILIATION";
    source_file: string;
    today_business_date: string;
    counts: Record<SchedulePreviewRow["status"], number>;
    rows: SchedulePreviewRow[];
};

export const scheduledShiftsApi = {
    context: () => apiRequest<ScheduleContext>("/schedules/context"),
    list: (dateFrom: string, dateTo: string) =>
        apiRequest<ScheduledShift[]>(`/schedules?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`),
    reconcile: (source_file: string, rows: ScheduleSourceRow[]) =>
        apiRequest<SchedulePreview>("/schedules/reconcile", {
            method: "POST", body: { source_file, rows },
        }),
    import: (source_file: string, rows: ScheduleSourceRow[], approved_source_rows: number[]) =>
        apiRequest<{ imported_count: number; provenance_count: number; already_imported_count: number; matched_existing_count: number; schedules: ScheduledShift[] }>("/schedules/import", {
            method: "POST", body: { source_file, rows, approved_source_rows: approved_source_rows.map(source_row => ({ source_row })) },
        }),
};

export type ScheduleDraft = {
    business_date: string;
    manager: ScheduledPerson | null;
    staff: ScheduledPerson[];
    schedule_type: "open" | "event" | "closed";
    event_notes: string | null;
    event_value: string | null;
};
export const scheduleEditorApi = {
    create: (body: ScheduleDraft) => apiRequest<ScheduledShift>("/schedules", { method: "POST", body }),
    update: (id: number, body: ScheduleDraft & { expected_revision: string }) =>
        apiRequest<ScheduledShift>(`/schedules/${id}`, { method: "PUT", body }),
};
