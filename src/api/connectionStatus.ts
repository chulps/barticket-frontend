// Shared in-memory connectivity state. A 401/403 is an application response,
// not proof that the backend is down. Never automatically replay a write.
let apiAvailable = true;

export function isApiAvailable(): boolean {
    return apiAvailable;
}

export function noteApiAvailability(available: boolean): void {
    if (apiAvailable === available) return;
    apiAvailable = available;
    window.dispatchEvent(new Event("barticket-api-status"));
    if (available) window.dispatchEvent(new Event("barticket-api-restored"));
}
