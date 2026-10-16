export type FeedbackKind = "success" | "error" | "info";
export type MutationFeedback = { id: number; kind: FeedbackKind; message: string };
export const FEEDBACK_EVENT = "barticket-mutation-feedback";
let nextFeedbackId = 1;

/** Announce confirmed saves or recoverable failures. Never include private API payloads. */
export function notifyMutation(kind: FeedbackKind, message: string): void {
  if (typeof window === "undefined") return;
  const detail: MutationFeedback = { id: nextFeedbackId++, kind, message };
  window.dispatchEvent(new CustomEvent<MutationFeedback>(FEEDBACK_EVENT, { detail }));
}
