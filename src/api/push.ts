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

async function pushRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("Sign in to enable notifications");
  const response = await fetch(`${API_URL}/push${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-BarTicket-Device": getDeviceId(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new PushRequestError(
      typeof detail.detail === "string" ? detail.detail : `Push request failed (${response.status})`,
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

export async function getPushEnabled(): Promise<boolean> {
  if (!supportsPush()) return false;
  const registration = await registerBarTicketWorker();
  return Boolean(await registration?.pushManager.getSubscription());
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
  const publicKey = await getPushPublicKey();
  if (!publicKey) throw new PushRequestError("Push notifications are not configured on the server", 503);
  const registration = await registerBarTicketWorker();
  if (!registration) throw new Error("Unable to register service worker");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(publicKey),
  });
  try {
    await pushRequest("/subscriptions", "POST", subscription.toJSON() as PushSubscriptionPayload);
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
}

export async function disablePush(): Promise<void> {
  const registration = await registerBarTicketWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await pushRequest("/subscriptions", "DELETE", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
