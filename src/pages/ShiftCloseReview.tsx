import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { accountApi, type ShiftReport } from "../api/account";
import { ApiError } from "../api/client";
import { ticketsApi, type ApiTicket } from "../api/tickets";
import { useModal } from "../hooks/useModal";
import { closeBlockers, previewPaidTotals, businessDateJst } from "./shiftControlPolicy";
import "./ShiftControls.css";

type Preview = { shift: ShiftReport; tickets: ApiTicket[] };
type Props = {
    shiftId: number;
    locale: string;
    onClosed: (closed: ShiftReport) => void;
};

export default function ShiftCloseReview({ shiftId, locale, onClosed }: Props) {
    const ja = locale === "ja";
    const navigate = useNavigate();
    const { forceCloseModal, registerCloseGuard } = useModal();
    const [preview, setPreview] = useState<Preview | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const submitInFlight = useRef(false);
    const [acknowledged, setAcknowledged] = useState(false);
    const [error, setError] = useState("");
    const [uncertain, setUncertain] = useState(false);

    useEffect(() => {
        let active = true;
        async function read() {
            try {
                const [current, tickets] = await Promise.all([accountApi.currentShift(), ticketsApi.list()]);
                if (!active) return;
                if (!current || current.status !== "open" || current.id !== shiftId) {
                    setPreview(null);
                    setError(ja ? "このシフトはすでに変更されています。画面を更新してください。" : "This shift has changed. Refresh its status before closing.");
                } else {
                    setPreview({ shift: current, tickets });
                }
            } catch {
                if (active) setError(ja ? "最新の伝票とシフトを確認できません。接続を確認してください。" : "Could not verify the current shift and tickets. Check the connection.");
            } finally {
                if (active) setLoading(false);
            }
        }
        void read();
        return () => { active = false; };
    }, [shiftId, ja]);

    useEffect(() => {
        registerCloseGuard(() => !working && !submitInFlight.current);
        return () => registerCloseGuard(null);
    }, [working, registerCloseGuard]);

    const blockers = closeBlockers(preview?.tickets ?? []);
    const active = preview?.shift.punches.filter(punch => punch.clock_out === null) ?? [];
    const live = preview ? previewPaidTotals(preview.tickets, preview.shift.id) : null;
    const stale = Boolean(preview && preview.shift.business_date !== businessDateJst(Date.now()));
    const yen = (n: number) => "¥" + n.toLocaleString("ja-JP");

    async function confirmClose() {
        if (!preview || blockers.length || !acknowledged || working || uncertain || submitInFlight.current) return;
        submitInFlight.current = true;
        setWorking(true);
        setError("");
        try {
            // Recheck directly before the write; backend #87 must still provide
            // transactional final validation against racing ticket mutations.
            const [latest, latestTickets] = await Promise.all([accountApi.currentShift(), ticketsApi.list()]);
            if (!latest || latest.status !== "open" || latest.id !== shiftId) {
                setPreview(null);
                setError(ja ? "シフトの状態が変わりました。再確認してください。" : "The active shift changed. Review it again before closing.");
                return;
            }
            if (closeBlockers(latestTickets).length) {
                setPreview({ shift: latest, tickets: latestTickets });
                setAcknowledged(false);
                setError(ja ? "未会計伝票があります。先に処理してください。" : "Open tickets remain. Resolve them before closing.");
                return;
            }
            const closed = await accountApi.closeShift();
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
                const current = await accountApi.currentShift();
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
                ? "このシフトは以前の営業日から継続しています。日付と勤務時間を慎重に確認してください。"
                : "This shift belongs to an earlier business date. Review the business date and working hours carefully."}</p> : null}
            <div className="shift-review-grid">
                <div><small>{ja ? "営業日" : "Business date"}</small><strong>{preview.shift.business_date}</strong></div>
                <div><small>{ja ? "シフト" : "Shift"}</small><strong>#{preview.shift.id}</strong></div>
                <div><small>{ja ? "会計済み売上（推定）" : "Paid revenue (preview)"}</small><strong>{yen(live?.paidTotal ?? 0)}</strong></div>
                <div><small>{ja ? "未会計伝票" : "Open tickets"}</small><strong>{blockers.length}</strong></div>
            </div>
            <p className="shift-muted">{ja ? "現金" : "Cash"} {yen(live?.cash ?? 0)}
                {" · "}{ja ? "カード" : "Card"} {yen(live?.card ?? 0)}
                {" · "}{ja ? "その他" : "Other"} {yen(live?.other ?? 0)}</p>
            {blockers.length ? <div className="shift-alert" role="alert">
                <strong>{ja ? "未会計伝票があるため閉店できません" : "Open tickets must be resolved first"}</strong>
                <ul>{blockers.slice(0, 12).map(ticket => <li key={ticket.id}>{ticket.name || "#" + ticket.id} (#{ticket.id}){ticket.shift_id !== shiftId ? " — " + (ja ? "別の営業日または未割当" : "Other night or unassigned") : ""}</li>)}</ul>
                {blockers.length > 12 ? <p>{ja ? "ほか" : "And"} {blockers.length - 12}</p> : null}
                <button type="button" className="secondary" onClick={goToTickets}>{ja ? "伝票を確認する" : "Go to tickets"}</button>
            </div> : null}
            <div className="shift-warning">
                <strong>{ja ? "勤務中のスタッフ" : "People currently clocked in"}: {active.length}</strong>
                {active.length ? <ul>{active.map(punch => <li key={punch.user_id}>{punch.name}</li>)}</ul>
                    : <p>{ja ? "全員退勤済みです。" : "No one is clocked in."}</p>}
                <p>{ja
                    ? "現在のサーバー仕様では、シフトを閉じると勤務中の全員が自動退勤となります。勤務時間に影響するため確認してください。"
                    : "Under the current server behavior, closing the shift clocks out everyone still working. This affects recorded working hours."}</p>
            </div>
            <label className="shift-ack">
                <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={working || uncertain} />
                <span>{ja
                    ? "未会計伝票がないことと、自動退勤の影響を確認しました。"
                    : "I have reviewed unresolved tickets and understand the automatic clock-outs."}</span>
            </label>
            <div className="shift-action-row">
                <button type="button" className="hollow secondary" disabled={working} onClick={forceCloseModal}>{ja ? "キャンセル" : "Cancel"}</button>
                <button type="button" className="danger" disabled={working || uncertain || !acknowledged || blockers.length > 0} onClick={() => void confirmClose()}>
                    {working ? (ja ? "閉店処理中…" : "Closing shift…")
                        : (ja ? "確認してシフトを閉じる" : "Confirm & close shift")}
                </button>
            </div>
        </> : !loading ? <button type="button" className="secondary" onClick={forceCloseModal}>
            {ja ? "戻って状態を更新" : "Return and refresh shift status"}
        </button> : null}
    </div>;
}
