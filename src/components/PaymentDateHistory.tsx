import { useEffect, useRef, useState } from "react";
import { accountApi } from "../api/account";
import { ApiError, getToken } from "../api/client";
import { ticketsApi, toTicket } from "../api/tickets";
import { useModal } from "../hooks/useModal";
import { useI18n } from "../i18n";
import { businessDateJst } from "../pages/shiftControlPolicy";
import type { Ticket } from "../types/Ticket";
import { correctionAudit, correctionRequest, type PaymentDateCorrection } from "./paymentDateCorrectionPolicy";

const recorded = (timestamp: number, ja: boolean) => new Date(timestamp * 1000).toLocaleString(ja ? "ja-JP" : "en-GB", { timeZone: "Asia/Tokyo", hour12: false }) + " JST";

export default function PaymentDateHistory({ ticket, canCorrect }: { ticket: Ticket; canCorrect: boolean }) {
    const { locale } = useI18n();
    const ja = locale === "ja";
    const { openModal } = useModal();
    if (!ticket.payments?.length) return null;
    return <section aria-label={ja ? "回収日と監査履歴" : "Collection dates and audit history"}>
        <p>{ja ? "サービス営業日" : "Service business date"}: {ticket.serviceBusinessDate ?? "—"}</p>
        <ul>{ticket.payments.map((payment, index) => <li key={payment.id ?? index}>
            <p>#{payment.id ?? "—"} · {payment.type} · ¥{payment.amount.toLocaleString("ja-JP")}</p>
            <p>{ja ? "実際の回収営業日" : "Actual collection business date"}: {payment.collection_business_date ?? "—"}</p>
            <p>{ja ? "記録日時" : "Recorded"}: {recorded(payment.recorded_at ?? payment.paid_at, ja)}{payment.collected_by ? ` · ${payment.collected_by}` : ""}</p>
            {payment.voided_at != null ? <p>{ja ? "POS記録取消済（返金ではありません）" : "POS-voided (not a refund)"} · {payment.voided_by ?? "—"} · {payment.void_reason}</p> : null}
            {canCorrect && payment.id && payment.voided_at == null ? <button type="button" className="small hollow secondary" onClick={() => openModal({
                title: ja ? "回収営業日を修正" : "Correct collection date", maxWidth: "560px",
                content: <PaymentDateCorrectionDialog ticketId={ticket.id} paymentId={payment.id!} />,
            })}>{ja ? "回収営業日を修正" : "Correct collection date"} · #{payment.id}</button> : null}
        </li>)}</ul>
        {(ticket.receivableHistory ?? []).filter(row => row.type === "payment_date_corrected").map((row, index) => {
            const audit = correctionAudit(row.note);
            return <p key={index}>{ja ? "日付修正" : "Date correction"}{audit ? ` #${audit.paymentId}: ${audit.before ?? "—"} → ${audit.after}` : ""}
                {` · ${row.actor} · ${recorded(row.created_at, ja)} · ${row.reason ?? "—"}`}</p>;
        })}
    </section>;
}

function PaymentDateCorrectionDialog({ ticketId, paymentId }: { ticketId: number; paymentId: number }) {
    const { locale } = useI18n();
    const ja = locale === "ja";
    const { closeModal, registerCloseGuard } = useModal();
    const [ticket, setTicket] = useState<Ticket | null>(null);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState("");
    const [reason, setReason] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [blocked, setBlocked] = useState<"stale" | "access" | null>(null);
    const [saved, setSaved] = useState(false);
    const [attempt, setAttempt] = useState<{ key: string; body: PaymentDateCorrection } | null>(null);
    const inFlight = useRef(false);
    const alive = useRef(true);
    const token = useRef(getToken());
    const generation = useRef(0);
    const payment = ticket?.payments?.find(row => row.id === paymentId);
    const [currentDate, setCurrentDate] = useState(() => businessDateJst(Date.now()));

    async function refresh() {
        const version = ++generation.current;
        setLoading(true); setError(""); setTicket(null);
        try {
            const [account, source] = await Promise.all([accountApi.me(), ticketsApi.get(ticketId)]);
            if (!alive.current || version !== generation.current || token.current !== getToken()) return;
            if (account.role !== "manager") { setBlocked("access"); setError(ja ? "管理者権限が必要です。" : "Manager access required."); return; }
            setCurrentDate(businessDateJst(Date.now())); setTicket(toTicket(source)); setDate(""); setReason(""); setConfirmed(false); setAttempt(null); setBlocked(null);
        } catch (err) {
            if (!alive.current || version !== generation.current) return;
            setError(ja ? "最新の支払いを確認できません。再読み込みしてください。" : "Could not verify the latest payment. Reload before correcting.");
            setBlocked(err instanceof ApiError && [401, 403].includes(err.status) ? "access" : "stale");
        } finally { if (alive.current && version === generation.current) setLoading(false); }
    }
    useEffect(() => {
        alive.current = true;
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => { window.clearTimeout(timer); alive.current = false; generation.current += 1; };
        // The dialog identity is fixed at open; reads are action-scoped, never polling.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        registerCloseGuard(() => !inFlight.current && (saved || (!date && !reason && !confirmed && !attempt) || window.confirm(ja
            ? "保存していない修正を閉じますか？結果不明の場合は、支払いを確認してから再操作してください。"
            : "Close this unsaved correction? If the outcome is unknown, verify the payment before another action.")));
        return () => registerCloseGuard(null);
    }, [registerCloseGuard, date, reason, confirmed, attempt, saved, ja]);

    const body = payment ? correctionRequest(payment, date, reason, ticket?.serviceBusinessDate, currentDate) : null;
    async function save() {
        if (inFlight.current || blocked || saved || !confirmed || (!attempt && !body)) return;
        if (token.current !== getToken()) { setBlocked("access"); setError(ja ? "再ログイン後に開き直してください。" : "Sign in again and reopen this review."); return; }
        const next = attempt ?? { key: crypto.randomUUID(), body: body! };
        setAttempt(next); inFlight.current = true; setBusy(true); setError("");
        try {
            const result = await ticketsApi.correctCollectionDate(ticketId, paymentId, next.body, next.key);
            if (!alive.current || token.current !== getToken()) return;
            setTicket(toTicket(result)); setSaved(true);
            window.dispatchEvent(new CustomEvent("barticket-push", { detail: { eventType: "ticket_updated", ticketId } }));
            for (const name of ["barticket-analytics-updated", "barticket-receivables-updated"]) window.dispatchEvent(new Event(name));
        } catch (err) {
            if (!alive.current) return;
            if (err instanceof ApiError && err.status === 409) {
                setBlocked("stale"); setError(ja ? "支払い情報が変わりました。最新の内容を再読み込みし、もう一度確認してください。" : "Payment changed. Reload the latest payment and review it again.");
            } else if (err instanceof ApiError && [401, 403].includes(err.status)) {
                setBlocked("access"); setError(ja ? "権限を確認できません。再ログイン後に開き直してください。" : "Access could not be verified. Sign in again and reopen this review.");
            } else if (err instanceof ApiError && err.status < 500) {
                setBlocked("stale"); setError(ja ? "修正は受け付けられませんでした。最新情報を確認してください。" : "Correction was rejected. Reload and review the current payment.");
            } else setError(ja ? "結果を確認できません。同じ修正を安全に再確認できます。内容は変更されません。" : "Outcome unknown. You can retry the same correction safely; its details are frozen.");
        } finally { inFlight.current = false; if (alive.current) setBusy(false); }
    }

    return <form onSubmit={event => { event.preventDefault(); void save(); }} style={{ display: "grid", gap: "var(--space-2)" }}>
        {loading ? <p role="status">{ja ? "最新の支払いを確認中…" : "Checking latest payment…"}</p> : null}
        {ticket && payment ? <>
            <p>#{ticketId} · {ticket.name} · {ja ? "支払い" : "Payment"} #{paymentId} · ¥{payment.amount.toLocaleString("ja-JP")}</p>
            <p>{ja ? "サービス営業日" : "Service business date"}: {ticket.serviceBusinessDate ?? "—"}</p>
            <p>{ja ? "現在の回収営業日" : "Current collection business date"}: {payment.collection_business_date ?? "—"}</p>
            <p>{ja ? "記録日時（変更されません）" : "Recorded (unchanged)"}: {recorded(payment.recorded_at ?? payment.paid_at, ja)}</p>
            <p>{ja ? "日付の割当のみを修正します。金額・来店日・記録日時・勤務時間は変更しません。実際の支払時刻は推定しません。営業日は日本時間の正午で切り替わります。" : "Correct date attribution only—not the amount, service date, recording timestamp or staff hours. No actual payment time is inferred. Business dates roll at noon JST."}</p>
            {saved ? <><p role="status">{ja ? "回収営業日の修正を保存しました。" : "Collection date correction saved."}</p><PaymentDateHistory ticket={ticket} canCorrect={false} /></> : payment.voided_at != null ? <p role="alert">{ja ? "取消済みの支払いは修正できません。" : "Voided payments cannot be corrected."}</p> : <fieldset disabled={busy || !!attempt || !!blocked} style={{ display: "grid", gap: "var(--space-2)" }}>
                <label>{ja ? "正しい回収営業日" : "Correct collection business date"}<input type="date" value={date} min={ticket.serviceBusinessDate ?? undefined} max={currentDate} required onChange={event => setDate(event.target.value)} /></label>
                <label>{ja ? "修正理由" : "Correction reason"}<textarea value={reason} maxLength={255} required onChange={event => setReason(event.target.value)} /></label>
                <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{ja ? "実際の回収営業日を確認し、この日付修正を承認します。" : "I verified the actual collection business date and confirm this date correction."}</label>
            </fieldset>}
        </> : !loading && !error ? <p role="alert">{ja ? "この支払いを確認できません。" : "This payment could not be verified."}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {blocked === "stale" ? <button type="button" disabled={busy || loading} onClick={() => void refresh()}>{ja ? "最新の支払いを再読み込み" : "Reload latest payment"}</button> : null}
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <button type="button" className="hollow secondary" disabled={busy} onClick={closeModal}>{saved ? (ja ? "完了" : "Done") : (ja ? "キャンセル" : "Cancel")}</button>
            {!saved ? <button type="submit" disabled={busy || loading || !!blocked || !confirmed || (!attempt && !body)}>{busy ? (ja ? "保存中…" : "Saving…") : attempt ? (ja ? "同じ修正を再確認" : "Retry same correction") : (ja ? "日付修正を保存" : "Save date correction")}</button> : null}
        </div>
    </form>;
}
