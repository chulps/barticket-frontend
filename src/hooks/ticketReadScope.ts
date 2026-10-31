export type TicketReadScope = {
    shift_id?: number;
    include_open?: boolean;
    date_from?: string;
    date_to?: string;
};

export function ticketListPath(scope?: TicketReadScope): string {
    const query = new URLSearchParams();
    if (scope?.shift_id !== undefined) query.set("shift_id", String(scope.shift_id));
    if (scope?.include_open) query.set("include_open", "true");
    if (scope?.date_from) query.set("date_from", scope.date_from);
    if (scope?.date_to) query.set("date_to", scope.date_to);
    return `/tickets${query.size ? `?${query}` : ""}`;
}

/** All-time exports remain explicit; normal views only request their visible dates. */
export function analyticsTicketScope(range: "all" | "year" | "month" | "day", key: string): TicketReadScope | undefined {
    if (range === "all") return undefined;
    if (range === "day") return {date_from: key, date_to: key};
    if (range === "year") return {date_from: `${key}-01-01`, date_to: `${key}-12-31`};
    const [year, month] = key.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {date_from: `${key}-01`, date_to: `${key}-${String(lastDay).padStart(2, "0")}`};
}
