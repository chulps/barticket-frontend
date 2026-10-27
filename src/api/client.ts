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

// api/client.ts

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
if (import.meta.env.PROD && !configuredApiUrl) {
    // Production must never silently call the visitor's localhost.
    throw new Error("BarTicket API URL is not configured for production.");
}
export const API_URL = (configuredApiUrl || "http://localhost:8000").replace(/\/$/, "");

const TOKEN_KEY = "barticket_token";
const DEVICE_KEY = "barticket_device_id";

export function getDeviceId(): string {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
}

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

async function revokePushForSession(previousToken: string): Promise<void> {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    const response = await fetch(`${API_URL}/push/subscriptions`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${previousToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    if (response.ok) await subscription.unsubscribe();
}

export function setToken(token: string | null) {
    const previousToken = localStorage.getItem(TOKEN_KEY);
    if (previousToken && previousToken !== token) {
        void revokePushForSession(previousToken).catch(() =>
            console.warn("Unable to revoke push subscription on sign out"),
        );
    }
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event("barticket-auth"));
}

export class ApiError extends Error {
    status: number;
    detail: unknown;

    constructor(status: number, message: string, detail?: unknown) {
        super(message);
        this.status = status;
        this.detail = detail;
    }
}

export async function apiRequest<T>(
    path: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
    const headers: Record<string, string> = { "X-BarTicket-Device": getDeviceId() };
    Object.assign(headers, options.headers);
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
        res = await fetch(`${API_URL}${path}`, {
            method: options.method ?? "GET",
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
    } catch (error) {
        noteApiAvailability(false);
        // Writes may have reached the server before the connection failed.
        // Do not retry them automatically.
        throw error;
    }
    noteApiAvailability(res.status < 500);

    if (!res.ok) {
        let message = `Request failed (${res.status})`;
        let detail: unknown;
        try {
            const data = await res.json();
            if (data && typeof data === "object" && "detail" in data) {
                detail = data.detail;
                if (typeof data.detail === "string") message = data.detail;
                else if (data.detail && typeof data.detail === "object" &&
                    "message" in data.detail && typeof data.detail.message === "string") {
                    message = data.detail.message;
                }
            }
        } catch {
            // Non-JSON error body; keep the status message.
        }
        throw new ApiError(res.status, message, detail);
    }

    return res.json();
}
