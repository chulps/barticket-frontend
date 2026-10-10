// api/client.ts

export const API_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

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
    const res = await fetch(`${API_URL}${path}`, {
        method: options.method ?? "GET",
        headers:
            options.body === undefined
                ? undefined
                : { "Content-Type": "application/json" },
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
