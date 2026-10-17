/** Confirm only for operations that would discard an actual working draft. */
export function canDiscard(dirty: boolean, ask: () => boolean): boolean {
  return !dirty || ask();
}

/** Infer CSV mapping without touching existing state before parsing succeeds. */
export function defaultCsvMapping(headers: readonly string[]): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const key of ["date", "manager", "revenue", "guests", "event"]) {
    const found = headers.find(header => header.toLowerCase().replace(/[^a-z]/g, "") === key);
    if (found) defaults[key] = found;
  }
  return defaults;
}
