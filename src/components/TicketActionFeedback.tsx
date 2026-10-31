import { useEffect, useState } from "react";
import type { TicketActionFeedback as Feedback } from "../pages/ticketActionFeedback";
import { useI18n } from "../i18n";
import "./TicketActionFeedback.css";

const labels = {
  created: ["伝票を作成しました", "Ticket created", "+"],
  paid: ["会計が完了しました", "Ticket paid", "✓"],
  cancelled: ["伝票をキャンセルしました", "Ticket cancelled", "×"],
  reopened: ["伝票を再開しました", "Ticket reopened", "↶"],
  "payment-recorded": ["入金を記録しました", "Payment recorded", "✓"],
} as const;

/** A separate, non-interactive layer: no row reordering, delayed navigation,
 * input remounts, layout measurement, audio or requests. Only the latest cue is
 * retained; changing its sequence restarts the short animation, not the ticket. */
export default function TicketActionFeedback({ feedback }: { feedback: Feedback | null }) {
  const { locale } = useI18n();
  const [expiredSequence, setExpiredSequence] = useState<number | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setExpiredSequence(feedback.sequence), 2400);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const current = feedback?.sequence === expiredSequence ? null : feedback;
  return <div className="ticket-action-feedback" role="status" aria-live="polite" aria-atomic="true">
    {current && <div key={current.sequence} className="ticket-action-cue" data-ticket-action={current.cue}>
      <span className="ticket-action-symbol" aria-hidden="true">{labels[current.cue][2]}</span>
      <span><strong>{labels[current.cue][locale === "ja" ? 0 : 1]}</strong><small>#{current.ticketId}</small></span>
    </div>}
  </div>;
}
