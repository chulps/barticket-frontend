/** Raw API records: keep identifiers, nulls and audit fields without UI conversion. */
export type ExportScope = "all-time" | "menu" | "admin";

export const exportSources = [
    { key: "tickets", path: "/tickets", shape: "array" },
    { key: "shifts", path: "/shifts", shape: "array" },
    { key: "closed_shift_analytics", path: "/analytics/shifts", shape: "array" },
    { key: "menu", path: "/menu", shape: "items" },
    { key: "archived_menu", path: "/menu/archived", shape: "items" },
    { key: "users", path: "/users", shape: "array" },
    { key: "notices", path: "/notices", shape: "notices" },
] as const;

export function sourcesForScope(scope: ExportScope) {
    return exportSources.filter(({ key }) => scope === "all-time" || (scope === "menu"
        ? key === "menu" || key === "archived_menu"
        : key === "users" || key === "shifts" || key === "closed_shift_analytics"));
}

type Reader = (path: string) => Promise<unknown>;
export type ExportProgress = { completed: number; total: number };

export async function collectAnalyticsExport(
    read: Reader,
    onProgress: (progress: ExportProgress) => void = () => {},
    scope: ExportScope = "all-time",
) {
    const requestedSources = sourcesForScope(scope);
    const startedAt = new Date().toISOString();
    const data: Record<string, unknown> = {};
    const sources: { key: string; endpoint: string; status: "exported" | "failed"; record_count: number | null; http_status?: number; reason?: string }[] = [];
    onProgress({ completed: 0, total: requestedSources.length });
    for (const source of requestedSources) {
        try {
            const value = await read(source.path);
            const records = source.shape === "array" ? value
                : value && typeof value === "object" && source.shape in value ? (value as Record<string, unknown>)[source.shape] : null;
            if (!Array.isArray(records)) {
                throw new Error("Unexpected response shape");
            }
            data[source.key] = value;
            sources.push({ key: source.key, endpoint: source.path, status: "exported", record_count: records.length });
        } catch (error) {
            const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : undefined;
            // Never download another account's data or turn an expired session into a partial success.
            if (status === 401 || (error instanceof Error && error.name === "AbortError")) throw error;
            // Server/network error messages can contain sensitive details; export only a fixed reason.
            sources.push({ key: source.key, endpoint: source.path, status: "failed", record_count: null, http_status: status,
                reason: status === 403 ? "Access denied" : status ? "API request failed" : "Request failed or response was invalid" });
        }
        onProgress({ completed: sources.length, total: requestedSources.length });
    }
    if (!sources.some((source) => source.status === "exported")) throw new Error("No data could be exported");
    return {
        format: "barticket-api-export",
        schema_version: 1,
        scope,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        all_requested_sources_exported: sources.every((source) => source.status === "exported"),
        database_backup: false,
        sources,
        limitations: [
            "Only records and fields exposed by the existing API are included. This is not a PostgreSQL backup or an automatically restorable database.",
            "Requests run separately; records may change during export. This is not a transaction-consistent snapshot.",
            "Tickets include open, paid and cancelled records. Cancelled tickets are retained for audit, not counted as revenue or guests by this export.",
            "The users endpoint includes active accounts only. Password hashes, Google identity IDs, sessions, push subscriptions and server secrets are not exposed.",
            "Shift punches and stockout history are included as returned; internal identifiers and fields omitted by the API cannot be recovered.",
            "Notices contains active notices for the current or latest shift, not the complete notification history.",
            "Browser-only settings, salary configurations and local storage are not included.",
            "No date or status filter is applied. Coverage is limited to records retained and returned by the server; deleted records cannot be recovered.",
        ],
        data,
    };
}
