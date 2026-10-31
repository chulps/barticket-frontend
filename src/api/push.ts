import { pushFetch, serializePushOperation } from "./pushLifecycle";
import { API_URL, getDeviceId, getToken } from "./client";

type PushKeys = { p256dh: string; auth: string };
type PushSubscriptionPayload = { endpoint: string; keys: PushKeys };

export class PushRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PushRequestError";
    this.status = status;
  }
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function supportsPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerBarTicketWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
}

function requireSession(token: string | null): asserts token is string {
  if (!token || getToken() !== token) throw new Error("Notification session changed");
}

async function pushRequest<T>(path: string, method = "GET", body?: unknown, token = getToken()): Promise<T> {
  requireSession(token);
  if (!token) throw new Error("Sign in to enable notifications");
  return pushFetch(`${API_URL}/push${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-BarTicket-Device": getDeviceId(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, async response => {
  requireSession(token);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new PushRequestError(
      typeof detail.detail === "string" ? detail.detail : `Push request failed (${response.status})`,
      response.status,
    );
  }
  const result = await response.json() as T;
  requireSession(token);
  return result;
  });
}

export async function getPushEnabled(): Promise<boolean> {
  if (!supportsPush()) return false;
  const token = getToken();
  return serializePushOperation(async () => {
    requireSession(token);
    const registration = await registerBarTicketWorker();
    const subscription = await registration?.pushManager.getSubscription();
    requireSession(token);
    if (!subscription || Notification.permission !== "granted") return false;
    const status = await pushRequest<{ enabled: boolean }>("/subscriptions/status", "POST", { endpoint: subscription.endpoint }, token);
    return status.enabled === true;
  });
}

export async function getPushPublicKey(): Promise<string | null> {
  try {
    const { public_key } = await pushRequest<{ public_key: string }>("/vapid-public-key");
    return public_key;
  } catch (error) {
    if (error instanceof PushRequestError && error.status === 503) return null;
    throw error;
  }
}

export async function enablePush(): Promise<void> {
  if (!supportsPush()) throw new Error("This browser does not support web push notifications");
  if (Notification.permission === "denied") throw new Error("Notifications are blocked in your device settings");
  const token = getToken();
  requireSession(token);
  const publicKey = await getPushPublicKey();
  requireSession(token);
  if (!publicKey) throw new PushRequestError("Push notifications are not configured on the server", 503);
  const permission = await Notification.requestPermission();
  requireSession(token);
  if (permission !== "granted") throw new Error("Notification permission was not granted");
  return serializePushOperation(async () => {
    requireSession(token);
    const registration = await registerBarTicketWorker();
    if (!registration) throw new Error("Unable to register service worker");
    requireSession(token);
    let existing = await registration.pushManager.getSubscription();
    requireSession(token);
    if (existing) {
      const status = await pushRequest<{ enabled: boolean }>("/subscriptions/status", "POST", { endpoint: existing.endpoint }, token);
      if (status.enabled !== true) {
        // Explicit opt-in may replace a stale local endpoint, but never claims
        // or deletes a subscription registered to another server account.
        await existing.unsubscribe();
        existing = null;
      }
    }
    requireSession(token);
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(publicKey),
    });
    try {
      requireSession(token);
      await pushRequest("/subscriptions", "POST", subscription.toJSON() as PushSubscriptionPayload, token);
    } catch (error) {
      if (!existing || getToken() !== token) await subscription.unsubscribe();
      throw error;
    }
  });
}

export async function disablePush(): Promise<void> {
  const token = getToken();
  return serializePushOperation(async () => {
    requireSession(token);
    const registration = await registerBarTicketWorker();
    const subscription = await registration?.pushManager.getSubscription();
    requireSession(token);
    if (!subscription) return;
    const unsubscribed = await subscription.unsubscribe();
    requireSession(token);
    if (!unsubscribed) throw new Error("Could not unsubscribe this device");
    await pushRequest("/subscriptions", "DELETE", { endpoint: subscription.endpoint }, token);
  });
}

