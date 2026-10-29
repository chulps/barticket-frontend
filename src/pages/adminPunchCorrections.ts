export function unixSecondsToJstInput(seconds: number): string {
    return new Date((seconds + 9 * 60 * 60) * 1000).toISOString().slice(0, 19);
}

export function jstInputToIso(value: string): string | null {
    if (!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}$/.test(value)) return null;
    const milliseconds = Date.parse(value + "+09:00");
    if (!Number.isFinite(milliseconds)) return null;
    if (unixSecondsToJstInput(milliseconds / 1000) !== value) return null;
    return value + "+09:00";
}

export function validPunchCorrection(clockIn: string, clockOut: string, now = Date.now()): boolean {
    const start = jstInputToIso(clockIn);
    const end = jstInputToIso(clockOut);
    if (!start || !end) return false;
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    return endMs > startMs && startMs <= now && endMs <= now;
}
