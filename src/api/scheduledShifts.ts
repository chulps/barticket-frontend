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
    id: number;
    business_date: string;
    schedule_state: "upcoming" | "today" | "past";
    actual_shift_exists: boolean;
    manager: ScheduledPerson | null;
    staff: ScheduledPerson[];
    event_value: string | null;
    hours: null;
    provenance: ScheduledShiftSource[];
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
