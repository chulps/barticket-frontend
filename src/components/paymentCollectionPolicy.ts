/** Date-only collection attribution is distinct from the timestamp recorded now. */
export function isPreviousServiceDate(serviceDate: string | null | undefined, currentDate: string): boolean {
    return !!serviceDate && serviceDate !== currentDate;
}

export function validCollectionConfirmation(date: string, reason: string, serviceDate: string | null | undefined, currentDate: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !reason.trim() || reason.trim().length > 255) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date &&
        date <= currentDate && (!serviceDate || date >= serviceDate);
}
