/** Confirm only for operations that would discard an actual working draft. */
export function canDiscard(dirty: boolean, ask: () => boolean): boolean {
  return !dirty || ask();
}

/** Infer CSV mapping without touching existing state before parsing succeeds. */
export function defaultCsvMapping(headers: readonly string[]): Record<string, string> {
  const defaults: Record<string, string> = {};
  const aliases: Record<string, string[]> = {
    date: ["date", "shiftdate", "businessdate"],
    manager: ["manager", "managername"],
    revenue: ["revenue", "sales"],
    guests: ["guests", "guest", "guestcount"],
    event: ["event", "shifttype"],
    staff: ["staff", "staffname", "employee"],
    hours: ["hours", "staffhours", "totalhours", "hoursworked"],
  };
  for (const [key, names] of Object.entries(aliases)) {
    const found = headers.find(header => names.includes(header.toLowerCase().replace(/[^a-z]/g, "")));
    if (found) defaults[key] = found;
  }
  return defaults;
}
