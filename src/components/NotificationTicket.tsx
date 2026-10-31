import { useEffect, useState } from "react";
import styled from "styled-components";
import { ApiError, getToken } from "../api/client";
import { ticketsApi, toTicket } from "../api/tickets";
import { clearNotificationReturn } from "../api/notificationNavigation";
import type { Ticket } from "../types/Ticket";
import { useI18n } from "../i18n";

/** Read-only destination: a notification tap must never execute a ticket action. */
export default function NotificationTicket({ ticketId }: { ticketId: number }) {
  const { locale } = useI18n();
  const ja = locale === "ja";
  const [state, setState] = useState<{id:number; ticket?:Ticket; failed?:boolean} | null>(null);
  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    let generation = 0;
    function load() {
    const request = ++generation;
    void ticketsApi.get(ticketId).then(data => {
      if (cancelled || request !== generation || getToken() !== token) return;
      setState({id:ticketId, ticket:toTicket(data)});
      clearNotificationReturn();
    }).catch(error => {
      if (cancelled || request !== generation || getToken() !== token) return;
      setState({id:ticketId, failed:true});
      if (!(error instanceof ApiError) || error.status !== 401) clearNotificationReturn();
    });
    }
    load();
    window.addEventListener("focus", load);
    window.addEventListener("barticket-push", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      window.removeEventListener("barticket-push", load);
    };
  }, [ticketId]);
  const current = state?.id === ticketId ? state : null;
  if (!current) return <p role="status">{ja ? "通知の伝票を読み込み中…" : "Loading the linked ticket…"}</p>;
  if (current.failed || !current.ticket) return <p role="alert">{ja
    ? "この伝票は利用できないか、閲覧権限がないか、読み込めませんでした。通知一覧を表示しています。"
    : "This ticket is unavailable, inaccessible, or could not be loaded. Your notifications are shown below."}</p>;
  const ticket = current.ticket;
  const status = ticket.status === "paid" ? (ja ? "支払済み" : "Paid")
    : ticket.status === "cancelled" ? (ja ? "取消済み" : "Cancelled") : (ja ? "未会計" : "Open");
  return <Panel aria-label={ja ? "通知の伝票" : "Linked ticket"}>
    <h3>{ticket.name || (ja ? "伝票" : "Ticket")} · #{ticket.id}</h3>
    <p>{status} · {ja ? "確認専用" : "Read-only"}</p>
    <ul>{ticket.items.map(item => <li key={item.id}>
      <span>{item.name} × {item.quantity}</span><strong>¥{item.subtotal.toLocaleString(ja ? "ja-JP" : "en-US")}</strong>
    </li>)}</ul>
    <p>{ja ? "合計" : "Total"}: <strong>¥{ticket.serverTotal?.toLocaleString(ja ? "ja-JP" : "en-US") ?? "—"}</strong></p>
  </Panel>;
}
const Panel = styled.section`
  padding: var(--space-2); margin-bottom: var(--space-3); border: 1px solid var(--neutral-600); border-radius: var(--space-2);
  h3 { overflow-wrap:anywhere; } ul { padding:0; list-style:none; } li { display:flex; justify-content:space-between; gap:var(--space-2); padding:var(--space-1) 0; }
`;
