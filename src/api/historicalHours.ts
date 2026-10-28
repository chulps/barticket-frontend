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

export type HistoricalHoursSourceCell = { source_row: number; source_column: string };
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
        state: HistoricalHoursState;
        reason: string;
    }>;
};

export const historicalHoursApi = {
    reconcile: (source_file: string, rows: HistoricalHoursSourceRow[]) =>
        apiRequest<HistoricalHoursPreview>("/historical-hours/reconcile", {
            method: "POST", body: { source_file, rows },
        }),
    import: (source_file: string, rows: HistoricalHoursSourceRow[], approved_source_cells: HistoricalHoursSourceCell[]) =>
        apiRequest<{ imported_count: number; already_imported_count: number; source_file: string; source_cells: HistoricalHoursSourceCell[] }>("/historical-hours/import", {
            method: "POST", body: { source_file, rows, approved_source_cells },
        }),
};
