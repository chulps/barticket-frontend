// api/client.ts

export const API_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

const TOKEN_KEY = "barticket_token";

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event("barticket-auth"));
}

export class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export async function apiRequest<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
): Promise<T> {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(`${API_URL}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
            const data = await res.json();
            if (typeof data.detail === "string") message = data.detail;
        } catch {
            // Non-JSON error body; keep the status message.
        }
        throw new ApiError(res.status, message);
    }

    return res.json();
}
