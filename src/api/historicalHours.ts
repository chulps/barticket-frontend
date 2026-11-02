import { apiRequest } from "./client";

export type HistoricalHoursSourceRow = {
    business_date: string;
    staff_name: string;
    user_id: number | null;
    hours: number;
    source_row: number;
    source_column: string;
    uncertainty?: string | null;
};

export type StoredHistoricalHours = {
    id: number; business_date: string; staff_name: string; user_id: number | null;
    duration_seconds: number; source_file: string; source_row: number; source_column: string;
    uncertainty: string | null; verification_state: string; account_unlinked: boolean;
};
export type HistoricalHoursExceptions = {
    mode: "READ_ONLY_EXCEPTIONS"; rows: StoredHistoricalHours[]; next_cursor: number | null;
};

export type HistoricalHoursSourceCell = { source_row: number; source_column: string; correction_reason?: string };
export type HistoricalHoursState = "match" | "new" | "conflict" | "duplicate_candidate" | "unmapped" | "already_imported" | "rejected";

export type HistoricalHoursPreview = {
    mode: "READ_ONLY_RECONCILIATION";
    source_file: string;
    row_count: number;
    counts: Record<HistoricalHoursState, number>;
    rows: Array<HistoricalHoursSourceRow & {
        source_seconds: number;
        clock_seconds: number | null;
        historical_seconds: number | null;
        effective_seconds: number | null;
        stored_record?: StoredHistoricalHours | null;
        account_unlinked?: boolean;
        state: HistoricalHoursState;
        reason: string;
    }>;
};

export const historicalHoursApi = {
    exceptions: (afterId = 0) =>
        apiRequest<HistoricalHoursExceptions>(`/historical-hours/exceptions?after_id=${afterId}&limit=50`),
    reconcile: (source_file: string, rows: HistoricalHoursSourceRow[]) =>
        apiRequest<HistoricalHoursPreview>("/historical-hours/reconcile", {
            method: "POST", body: { source_file, rows },
        }),
    import: (source_file: string, rows: HistoricalHoursSourceRow[], approved_source_cells: HistoricalHoursSourceCell[]) =>
        apiRequest<{ imported_count: number; corrected_count: number; already_imported_count: number; source_file: string; source_cells: HistoricalHoursSourceCell[] }>("/historical-hours/import", {
            method: "POST", body: { source_file, rows, approved_source_cells },
        }),
};
