import { startBackgroundRefresh } from "../hooks/backgroundRefresh";
import { shouldPoll } from "../api/realtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { accountApi, type ShiftReport } from "../api/account";
import { ApiError } from "../api/client";
import { ticketsApi, type ApiTicket } from "../api/tickets";
import { useModal } from "../hooks/useModal";
import { closeBlockers, isReadinessForShift } from "./shiftControlPolicy";
import "./ShiftControls.css";

type Preview = { shift: ShiftReport; tickets: ApiTicket[] };
type Readiness = Awaited<ReturnType<typeof accountApi.closeReadiness>>;
type Props = {
    shiftId: number;
    locale: string;
    onClosed: (closed: ShiftReport) => void;
    allowStale?: boolean;
    businessDate: string;
    allowKeepOpen?: boolean;
    onKeptOpen?: (shift: ShiftReport) => void;
};

export default function ShiftCloseReview({ shiftId, locale, onClosed, allowStale = false, businessDate, allowKeepOpen = false, onKeptOpen }: Props) {
    const ja = locale === "ja";
    const navigate = useNavigate();
    const { forceCloseModal, registerCloseGuard } = useModal();
    const [preview, setPreview] = useState<Preview | null>(null);
    const [readiness, setReadiness] = useState<Readiness | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const submitInFlight = useRef(false);
    const reviewVersion = useRef(0);
    const [acknowledged, setAcknowledged] = useState(false);
    const [error, setError] = useState("");
    const [uncertain, setUncertain] = useState(false);
    const [keepOpenReason, setKeepOpenReason] = useState("");

    const getActiveShift = useCallback(async (): Promise<ShiftReport | null> => {
        if (allowStale) {
            const shifts = await accountApi.shiftHistory();
            return shifts.find(row => row.id === shiftId && row.status === "open") ?? null;
        }
        return accountApi.currentShift();
    }, [allowStale, shiftId]);

    useEffect(() => {
        let active = true;
        const invalidate = () => {
            reviewVersion.current++;
            setAcknowledged(false);
            setReadiness(null);
        };
        const events = ["barticket-shift-updated", "barticket-auth", "barticket-api-restored", "focus", "online"];
        events.forEach(event => window.addEventListener(event, invalidate));
        document.addEventListener("visibilitychange", invalidate);
        async function read() {
            if (submitInFlight.current) return;
            const request = ++reviewVersion.current;
            setLoading(true);
            setReadiness(null);
            setAcknowledged(false);
            try {
                const [current, tickets, ready] = await Promise.all([getActiveShift(), ticketsApi.list(), accountApi.closeReadiness()]);
                if (!active || request !== reviewVersion.current || submitInFlight.current) return;
                if (!current || current.status !== "open" || current.id !== shiftId) {
                    setPreview(null);
                    setError(ja ? "このシフトはすでに変更されています。画面を更新してください。" : "This shift has changed. Refresh its status before closing.");
                } else {
                    if (!uncertain) setError("");
                    setPreview({ shift: current, tickets });
                    if (isReadinessForShift(ready, shiftId)) {
                        setReadiness(ready);
                    } else {
                        setReadiness(null);
                        setAcknowledged(false);
                        setError(ja
                            ? "閉店情報を確認できません。再読み込みしてから閉店してください。"
                            : "Close readiness could not be verified. Refresh and recheck before closing.");
                    }
                }
            } catch {
                if (active && request === reviewVersion.current) {
                    setPreview(null);
                    setReadiness(null);
                    setError(ja ? "最新の伝票とシフトを確認できません。接続を確認してください。" : "Could not verify the current shift and tickets. Check the connection.");
                }
            } finally {
                if (active && request === reviewVersion.current) setLoading(false);
            }
        }
        const stop = startBackgroundRefresh({ refresh: read, shouldPoll, events });
        return () => {
            active = false;
            reviewVersion.current++;
            stop();
            events.forEach(event => window.removeEventListener(event, invalidate));
            document.removeEventListener("visibilitychange", invalidate);
        };
    }, [getActiveShift, ja, shiftId, uncertain]);

    useEffect(() => {
        registerCloseGuard(() => !working && !submitInFlight.current);
        return () => registerCloseGuard(null);
    }, [working, registerCloseGuard]);

    const blockers = closeBlockers(preview?.tickets ?? []);
    const readinessMatches = isReadinessForShift(readiness, shiftId);
    const verifiedReadiness = readinessMatches ? readiness : null;
    const carryForwards = verifiedReadiness?.approved_carry_forwards ?? [];
    const active = preview?.shift.punches.filter(punch => punch.clock_out === null) ?? [];
    // Server readiness sums the collection ledger, including later collections
    // on old tickets; ticket totals are not a substitute for collected cash.
    const live = verifiedReadiness ? {
        paidTotal: verifiedReadiness.finalized_totals.collected_total,
        cash: verifiedReadiness.finalized_totals.cash_total,
        card: verifiedReadiness.finalized_totals.card_total,
        other: verifiedReadiness.finalized_totals.other_total,
    } : null;
    const stale = Boolean(preview && preview.shift.business_date !== businessDate);
    const yen = (n: number) => "¥" + n.toLocaleString("ja-JP");

    async function confirmClose() {
        if (!preview || !readinessMatches || blockers.length || !acknowledged || working || uncertain || submitInFlight.current) return;
        const request = ++reviewVersion.current;
        submitInFlight.current = true;
        setWorking(true);
        setError("");
        try {
            // Recheck directly before the write; backend #87 must still provide
            // transactional final validation against racing ticket mutations.
            const [latest, latestTickets, ready] = await Promise.all([getActiveShift(), ticketsApi.list(), accountApi.closeReadiness()]);
            if (request !== reviewVersion.current) {
                setReadiness(null);
                setAcknowledged(false);
                setError(ja ? "シフトが更新されました。もう一度確認してください。" : "The shift was updated. Review it again before closing.");
                return;
            }
            if (!latest || latest.status !== "open" || latest.id !== shiftId) {
                setPreview(null);
                setError(ja ? "シフトの状態が変わりました。再確認してください。" : "The active shift changed. Review it again before closing.");
                return;
            }
            if (!isReadinessForShift(ready, shiftId)) {
                setReadiness(null);
                setAcknowledged(false);
                setError(ja
                    ? "閉店情報を確認できません。再読み込みしてから閉店してください。"
                    : "Close readiness could not be verified. Refresh and recheck before closing.");
                return;
            }
            if (!ready.can_close || closeBlockers(latestTickets).length) {
                setPreview({ shift: latest, tickets: latestTickets });
                setReadiness(ready);
                setAcknowledged(false);
                setError(ja ? "未解決の伝票があります。先に処理してください。" : "Unresolved tickets remain. Resolve them before closing.");
                return;
            }
            const closed = await accountApi.closeShift(shiftId);
            onClosed(closed);
            forceCloseModal();
        } catch (err) {
            // After an ambiguous failure the POST might have committed. Never
            // automatically replay a close operation.
            const ambiguous = !(err instanceof ApiError) || err.status >= 500;
            setUncertain(ambiguous);
            setError(ambiguous
                ? (ja ? "結果を確認できません。閉店済みの可能性があります。シフト状況を再読み込みして確認してください。再送信はしません。" : "Outcome unknown: the shift may already be closed. Refresh its status before taking another action. The close request will not be resent.")
                : (ja ? "閉店できませんでした。未会計伝票とスタッフの状態を確認してください。" : "Close was rejected. Check open tickets and current staff status.") + " (" + err.message + ")");
            try {
                const current = await getActiveShift();
                if (current?.id === shiftId) {
                    const tickets = await ticketsApi.list();
                    setPreview({ shift: current, tickets });
                } else setPreview(null);
            } catch {
                setPreview(null);
            }
        } finally {
            submitInFlight.current = false;
            setWorking(false);
            window.dispatchEvent(new Event("barticket-shift-updated"));
        }
    }

    async function confirmKeepOpen() {
        const reason = keepOpenReason.trim();
        if (!allowKeepOpen || !preview || !reason || working || uncertain || submitInFlight.current) return;
        submitInFlight.current = true;
        setWorking(true);
        setError("");
        try {
            const kept = await accountApi.keepShiftOpen(shiftId, reason);
            onKeptOpen?.(kept);
            forceCloseModal();
        } catch (err) {
            const ambiguous = !(err instanceof ApiError) || err.status >= 500;
            setUncertain(ambiguous);
            setError(ambiguous
                ? (ja ? "結果を確認できません。シフトが保留された可能性があります。状態を再読み込みしてください。再送信はしません。" : "The result is unknown. The shift may have been kept open. Refresh its status before taking another action; this request will not be resent.")
                : (ja ? "シフトを保留できませんでした。" : "Could not keep the shift open.") + " (" + err.message + ")");
            try {
                const [latest, ready] = await Promise.all([getActiveShift(), accountApi.closeReadiness()]);
                if (latest?.id === shiftId && isReadinessForShift(ready, shiftId)) {
                    setPreview(current => current ? { ...current, shift: latest } : current);
                    setReadiness(ready);
                }
            } catch { /* Keep the original error visible; never replay an ambiguous POST. */ }
        } finally {
            submitInFlight.current = false;
            setWorking(false);
        }
    }

    function goToTickets() {
        forceCloseModal();
        navigate("/tickets");
    }

    return <div className="shift-close-review">
        <p className="shift-muted">{ja
            ? "確認用の情報です。最終的な閉店可否はサーバー側で判断されます。"
            : "This is a pre-close preview. The server makes the final decision; data may change."}</p>
        {loading ? <p role="status">{ja ? "伝票と勤務状況を確認しています…" : "Checking tickets and staff…"}</p> : null}
        {error ? <p className="shift-alert" role="alert">{error}</p> : null}
        {preview ? <>
            {stale ? <p className="shift-alert" role="alert">{ja
                ? "このシフトは以前の営業日です。各伝票の実際の入金日を確認し、未払い残高は明示的に繰り越してください。その後、この営業日を締めて現在の営業日を開始します。自動で支払済みやキャンセルにはなりません。"
                : "This shift belongs to an earlier business date. Review each ticket: record when payment was actually collected, or explicitly defer a genuinely unpaid balance. Then close this reviewed night and start the current night. Nothing is automatically paid or cancelled."}</p> : null}
            <div className="shift-review-grid">
                <div><small>{ja ? "営業日" : "Business date"}</small><strong>{preview.shift.business_date}</strong></div>
                <div><small>{ja ? "シフト" : "Shift"}</small><strong>#{preview.shift.id}</strong></div>
                <div><small>{ja ? "会計済み売上（推定）" : "Paid revenue (preview)"}</small><strong>{live ? yen(live.paidTotal) : "—"}</strong></div>
                <div><small>{ja ? "未会計伝票" : "Open tickets"}</small><strong>{blockers.length}</strong></div>
                <div><small>{ja ? "繰越残高" : "Carried balance"}</small><strong>{verifiedReadiness ? yen(verifiedReadiness.receivables.outstanding_total) : "—"}</strong></div>
            </div>
            {!readinessMatches ? <p className="shift-alert" role="alert">{ja
                ? "入金額、繰越残高と閉店可否を確認できません。最新情報を再読み込みしてください。"
                : "Collected totals, carry balances and close eligibility are unavailable until this shift’s readiness is verified. Refresh and recheck."}</p> : null}
            <p className="shift-muted">{ja ? "現金" : "Cash"} {live ? yen(live.cash) : "—"}
                {" · "}{ja ? "カード" : "Card"} {live ? yen(live.card) : "—"}
                {" · "}{ja ? "PayPay・その他" : "PayPay / other"} {live ? yen(live.other) : "—"}</p>
            {blockers.length ? <div className="shift-alert" role="alert">
                <strong>{ja ? "未会計伝票があるため閉店できません" : "Open tickets must be resolved first"}</strong>
                <ul>{blockers.slice(0, 12).map(ticket => <li key={ticket.id}>{ticket.name || "#" + ticket.id} (#{ticket.id}){ticket.shift_id !== shiftId ? " — " + (ja ? "別の営業日または未割当" : "Other night or unassigned") : ""}</li>)}</ul>
                {blockers.length > 12 ? <p>{ja ? "ほか" : "And"} {blockers.length - 12}</p> : null}
                <button type="button" className="secondary" onClick={goToTickets}>{ja ? "伝票を確認する" : "Go to tickets"}</button>
            </div> : null}
            {carryForwards.length ? <div className="shift-warning">
                <strong>{ja ? "閉店後も残る未払い伝票" : "Unpaid tickets carried forward"}</strong>
                <ul>{carryForwards.map(ticket => <li key={ticket.ticket_id}>
                    {ticket.name || `#${ticket.ticket_id}`} · {ja ? "請求" : "Billed"} {yen(ticket.billed_total)} · {ja ? "回収済" : "Collected"} {yen(ticket.collected_total)} · {ja ? "残高" : "Balance"} {yen(ticket.remaining_total)}
                </li>)}</ul>
                <p>{ja ? "閉店しても債権は消えず、後日の回収はこの営業日の売上や来店人数を変更しません。" : "Closing does not erase the debt. Later collections do not alter this shift's service sales or guest count."}</p>
            </div> : null}
            <div className="shift-warning">
                <strong>{ja ? "勤務中のスタッフ" : "People currently clocked in"}: {verifiedReadiness?.automatic_clock_out.will_clock_out_count ?? active.length}</strong>
                {(verifiedReadiness?.automatic_clock_out.will_clock_out_staff ?? active).length ? <ul>{(verifiedReadiness?.automatic_clock_out.will_clock_out_staff ?? active).map(punch => <li key={punch.user_id}>{punch.name}</li>)}</ul>
                    : <p>{ja ? "全員退勤済みです。" : "No one is clocked in."}</p>}
                <p>{ja
                    ? "現在のサーバー仕様では、シフトを閉じると勤務中の全員が自動退勤となります。勤務時間に影響するため確認してください。"
                    : "Under the current server behavior, closing the shift clocks out everyone still working. This affects recorded working hours."}</p>
            </div>
            {allowKeepOpen ? <div className="shift-warning">
                <strong>{ja ? "シフトを正午以降も継続" : "Keep the shift open past noon"}</strong>
                <p>{ja ? "続行する理由を記録してください。正午にスタッフは自動退勤し、シフトの終了には管理者が必要です。" : "Record why the shift must continue. Staff will still be clocked out at noon, and a manager will be required to close the shift."}</p>
                <label>
                    <span>{ja ? "継続理由（必須）" : "Reason (required)"}</span>
                    <textarea maxLength={255} value={keepOpenReason} onChange={event => setKeepOpenReason(event.target.value)} disabled={working || uncertain} required />
                </label>
                <button type="button" className="secondary" disabled={working || uncertain || !keepOpenReason.trim()} onClick={() => void confirmKeepOpen()}>
                    {ja ? "理由を記録してシフトを継続" : "Record reason & keep shift open"}
                </button>
            </div> : null}
            <label className="shift-ack">
                <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={working || uncertain || loading || !readinessMatches} />
                <span>{ja
                    ? stale
                        ? "前の営業日、未解決伝票、繰越残高、自動退勤の影響を確認し、復旧のためにシフトを閉じることを確認しました。"
                        : "未解決伝票、繰越残高、自動退勤の影響を確認しました。"
                    : stale
                        ? "I reviewed the previous business date, active blockers, carried balances, and automatic clock-outs before confirming recovery close."
                        : "I reviewed active blockers, carried balances, and automatic clock-outs before closing."}</span>
            </label>
            <div className="shift-action-row">
                <button type="button" className="hollow secondary" disabled={working} onClick={forceCloseModal}>{ja ? "キャンセル" : "Cancel"}</button>
                <button type="button" className="danger" disabled={working || uncertain || loading || !readinessMatches || !acknowledged || blockers.length > 0} onClick={() => void confirmClose()}>
                    {working ? (ja ? "閉店処理中…" : "Closing shift…")
                        : (ja ? "確認してシフトを閉じる" : "Confirm & close shift")}
                </button>
            </div>
        </> : !loading ? <button type="button" className="secondary" onClick={forceCloseModal}>
            {ja ? "戻って状態を更新" : "Return and refresh shift status"}
        </button> : null}
    </div>;
}

