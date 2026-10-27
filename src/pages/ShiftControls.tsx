import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ApiError } from "../api/client";
import { useModal } from "../hooks/useModal";
import ShiftCloseReview from "./ShiftCloseReview";
import { businessDateJst, canManageShift, currentPunch, workedSeconds } from "./shiftControlPolicy";
import "./ShiftControls.css";

type Lookup = { status: "loading" | "ready" | "error"; shift: ShiftReport | null };
type OpenEligibility = "checking" | "allowed" | "closed-today" | "error";
type StaleInfo = { shiftId: number; businessDate: string };
type ShiftConflict = { code?: unknown; shift_id?: unknown; business_date?: unknown };

function conflictDetail(error: unknown): ShiftConflict | null {
    if (!(error instanceof ApiError) || !error.detail || typeof error.detail !== "object") return null;
    return error.detail as ShiftConflict;
}

export default function ShiftControls({ account, locale }: { account: Account; locale: string }) {
    const ja = locale === "ja";
    const navigate = useNavigate();
    const { openModal } = useModal();
    const [lookup, setLookup] = useState<Lookup>({ status: "loading", shift: null });
    const [staleInfo, setStaleInfo] = useState<StaleInfo | null>(null);
    const [eligibility, setEligibility] = useState<OpenEligibility>("checking");
    const [closedToday, setClosedToday] = useState<ShiftReport | null>(null);
    const [pending, setPending] = useState<"" | "open" | "reopen" | "clock-in" | "clock-out">("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [closedSummary, setClosedSummary] = useState<ShiftReport | null>(null);
    const [reopenReason, setReopenReason] = useState("");
    const [reopenConfirmed, setReopenConfirmed] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const version = useRef(0);
    const mounted = useRef(true);
    const mutation = useRef(false);
    const roleCanManage = canManageShift(account.role);
    const today = businessDateJst(now);
    const shift = lookup.status === "ready" ? lookup.shift : null;
    const activePunch = currentPunch(shift, account.id);
    const stale = Boolean(staleInfo || (shift && shift.business_date !== today));
    const formatTime = (epoch: number) => new Date(epoch * 1000).toLocaleTimeString(ja ? "ja-JP" : "en-US", {
        timeZone: "Asia/Tokyo", hour: "numeric", minute: "2-digit",
    });
    const formatHours = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        return Math.floor(mins / 60) + "h " + String(mins % 60).padStart(2, "0") + "m";
    };
    const yen = (value: number) => "¥" + value.toLocaleString("ja-JP");

    const refresh = useCallback(async () => {
        if (mutation.current) return;
        const request = ++version.current;
        try {
            const current = await accountApi.currentShift();
            if (!mounted.current || request !== version.current || mutation.current) return;
            if (!current) {
                setEligibility("checking");
                try {
                    const history = await accountApi.closedShifts();
                    if (!mounted.current || request !== version.current || mutation.current) return;
                    const today = businessDateJst(Date.now());
                    const closed = history.find(row => row.business_date === today && row.status === "closed") ?? null;
                    setClosedToday(closed);
                    setEligibility(closed ? "closed-today" : "allowed");
                } catch {
                    if (!mounted.current || request !== version.current || mutation.current) return;
                    setEligibility("error");
                }
            } else {
                setClosedToday(null);
                setEligibility("checking");
            }
            if (mounted.current && request === version.current && !mutation.current) {
                setStaleInfo(null);
                setLookup({ status: "ready", shift: current });
            }
        } catch (err) {
            if (mounted.current && request === version.current && !mutation.current) {
                const conflict = conflictDetail(err);
                if (conflict?.code === "STALE_OPEN_SHIFT" && Number.isSafeInteger(conflict.shift_id) &&
                    typeof conflict.business_date === "string") {
                    setStaleInfo({ shiftId: Number(conflict.shift_id), businessDate: conflict.business_date });
                    setEligibility("error");
                    if (account.role === "manager") {
                        try {
                            const history = await accountApi.shiftHistory();
                            if (!mounted.current || request !== version.current || mutation.current) return;
                            const oldOpen = history.find(row => row.id === Number(conflict.shift_id) && row.status === "open") ?? null;
                            setLookup({ status: "ready", shift: oldOpen });
                        } catch {
                            if (mounted.current && request === version.current && !mutation.current) setLookup({ status: "ready", shift: null });
                        }
                    } else setLookup({ status: "ready", shift: null });
                } else {
                    setLookup({ status: "error", shift: null });
                    setEligibility("error");
                }
            }
        }
    }, [account.role]);

    useEffect(() => {
        mounted.current = true;
        const initialRefresh = window.setTimeout(() => void refresh(), 0);
        const poll = window.setInterval(() => void refresh(), 20000);
        const tick = window.setInterval(() => setNow(Date.now()), 15000);
        const onRefresh = () => void refresh();
        window.addEventListener("focus", onRefresh);
        window.addEventListener("barticket-api-restored", onRefresh);
        window.addEventListener("barticket-shift-updated", onRefresh);
        return () => {
            mounted.current = false;
            version.current++;
            window.clearTimeout(initialRefresh);
            window.clearInterval(poll);
            window.clearInterval(tick);
            window.removeEventListener("focus", onRefresh);
            window.removeEventListener("barticket-api-restored", onRefresh);
            window.removeEventListener("barticket-shift-updated", onRefresh);
        };
    }, [refresh]);

    async function perform(action: "open" | "reopen" | "clock-in" | "clock-out") {
        if (mutation.current || lookup.status !== "ready") return;
        if (action === "open" && (shift || stale || closedToday || eligibility !== "allowed")) return;
        if (action === "reopen" && (account.role !== "manager" || !closedToday || !reopenConfirmed || !reopenReason.trim())) return;
        if (action !== "open" && action !== "reopen" && (!shift || stale)) return;
        mutation.current = true;
        version.current++;
        setPending(action);
        setNotice("");
        setError("");
        setClosedSummary(null);
        try {
            const result = action === "open" ? await accountApi.openShift()
                : action === "reopen" && closedToday ? await accountApi.reopenShift(closedToday.id, reopenReason.trim())
                    : action === "clock-in" ? await accountApi.clockIn() : await accountApi.clockOut();
            if (!mounted.current) return;
            setLookup({ status: "ready", shift: result });
            setClosedToday(null);
            setStaleInfo(null);
            setReopenReason("");
            setReopenConfirmed(false);
            setNotice(action === "open"
                ? result.operation === "joined"
                    ? (ja ? "営業中のシフトに参加しました。勤務時間を記録するには出勤してください。" : "Joined the open shift. Clock in to record your working time.")
                    : (ja ? "シフトを開始しました。勤務時間を記録するには次に出勤してください。" : "Started a new shift. Clock in next to record your working hours.")
                : action === "reopen"
                    ? (ja ? "シフトを再開しました。前回の閉店記録は保存され、次の閉店時に売上が再計算されます。" : "Shift reopened. The prior close is saved; totals are recalculated when it closes again.")
                : action === "clock-in" ? (ja ? "出勤を記録しました。" : "Clock-in recorded.")
                    : (ja ? "退勤を記録しました。" : "Clock-out recorded."));
            window.dispatchEvent(new Event("barticket-shift-updated"));
        } catch (err) {
            if (!mounted.current) return;
            const conflict = conflictDetail(err);
            if (conflict?.code === "STALE_OPEN_SHIFT" || conflict?.code === "SHIFT_REOPEN_REQUIRED") {
                await refresh();
                setError(conflict.code === "STALE_OPEN_SHIFT"
                    ? (ja ? "前の営業日のシフトが残っています。開始や再開はせず、内容を確認してください。" : "A previous business day's shift is still open. Review it before starting or reopening another shift.")
                    : (ja ? "本日のシフトはすでに閉店しています。再開する場合は管理者が理由を記録してください。" : "Today's shift is already closed. A manager must record a reason to reopen it."));
            } else {
                const unknown = !(err instanceof ApiError);
                setError(unknown
                    ? (ja ? "通信エラーのため結果が不明です。自動で再送信せず、サーバーの状態を再確認します。" : "Connection interrupted. The result may have committed. This action will not be resent automatically.")
                    : (ja ? "操作できません。シフト状態と権限を確認してください。" : "Action rejected. Check your permissions and shift state.") + " (" + err.message + ")");
                setLookup({ status: "loading", shift: null });
            }
        } finally {
            mutation.current = false;
            if (mounted.current) {
                setPending("");
                void refresh();
            }
        }
    }

    function onClosed(closed: ShiftReport) {
        version.current++;
        setLookup({ status: "ready", shift: null });
        setStaleInfo(null);
        setEligibility("checking");
        setClosedSummary(closed);
        setError("");
        setNotice(ja ? "シフトを閉じました。" : "Shift closed successfully.");
        window.dispatchEvent(new Event("barticket-shift-updated"));
        void refresh();
    }

    function reviewClose() {
        if (!shift || !roleCanManage || mutation.current) return;
        openModal({
            title: stale ? (ja ? "前の営業日の確認・復旧" : "Review & recover previous shift")
                : (ja ? "閉店前の確認" : "Review & close shift"),
            closeStyle: "icon",
            fitContent: true,
            maxWidth: "620px",
            content: <ShiftCloseReview shiftId={shift.id} locale={locale} onClosed={onClosed} allowStale={stale} businessDate={today} />,
        });
    }

    return <>
        <section className="shift-section" aria-label={ja ? "自分のタイムカード" : "My time clock"}>
            <h2>{ja ? "自分のタイムカード" : "My Time Clock"}</h2>
            {lookup.status === "loading" ? <p role="status">{ja ? "勤務状況を確認中…" : "Checking your work status…"}</p>
                : lookup.status === "error" ? <p role="alert">{ja ? "勤務状況を取得できません。出退勤の操作は確認まで停止しています。" : "Could not verify your work status. Clock controls are unavailable until verified."}</p>
                    : <div className="shift-status">
                        <span className={"shift-status-pill" + (activePunch ? " is-on-duty" : "")}>
                            {activePunch ? (ja ? "勤務中" : "Clocked in")
                                : staleInfo ? (ja ? "前回シフトの確認が必要" : "Previous shift needs review")
                                    : (ja ? "勤務時間の記録なし" : "Not clocked in")}
                        </span>
                        {shift ? <small>{ja ? "営業日" : "Business date"}: {shift.business_date}</small>
                            : staleInfo ? <small>{ja ? "前回の営業日" : "Previous business date"}: {staleInfo.businessDate}</small> : null}
                    </div>}
            {shift && !stale ? <div className="shift-card-details">
                <div><small>{ja ? "出勤時刻" : "Clocked in at"}</small>
                    <strong>{activePunch ? formatTime(activePunch.clock_in) : "—"}</strong></div>
                <div><small>{ja ? "記録された勤務時間" : "Recorded time"}</small>
                    <strong>{formatHours(workedSeconds(shift, account.id, now / 1000))}</strong></div>
            </div> : null}
            {stale ? <p className="shift-alert" role="alert">{ja
                ? "前の営業日のシフトがまだ開いています（" + (staleInfo?.businessDate ?? shift?.business_date ?? "—") + "）。内容を確認してから復旧してください。"
                : "The shift for " + (staleInfo?.businessDate ?? shift?.business_date ?? "a previous date") + " is still open. Review its contents before recovery."}</p> : null}
            {lookup.status === "ready" && !shift && !staleInfo ? <p className="shift-muted">{eligibility === "error"
                ? (ja ? "シフト履歴を確認できません。状態を確認するまで操作できません。" : "Shift history could not be verified. Actions are disabled until its status is known.")
                : (ja ? "営業中のシフトがありません。ログイン中のスタッフがシフトを開始できます。" : "No shift is open. Any signed-in staff member can start the business shift.")}</p> : null}
            {lookup.status === "ready" && shift && !stale ? <div className="shift-action-row">
                <button type="button" className="secondary" disabled={!!pending}
                    onClick={() => void perform(activePunch ? "clock-out" : "clock-in")}>
                    {pending ? (ja ? "記録中…" : "Recording…") : activePunch ? (ja ? "退勤" : "Clock Out") : (ja ? "出勤" : "Clock In")}
                </button>
            </div> : null}
            <p className="shift-muted">{ja ? "シフトを開く操作と個人の出勤記録は別です。シフト開始後、勤務を記録するには出勤してください。" : "Opening the venue shift is separate from recording work hours. Clock in after the shift opens."}</p>
            {error ? <p role="alert" className="shift-alert">{error}</p> : null}
            {notice ? <p role="status">{notice}</p> : null}
            {lookup.status === "error" ? <button type="button" className="hollow secondary" onClick={() => void refresh()}>
                {ja ? "再試行" : "Retry"}
            </button> : null}
        </section>

        {roleCanManage ? <section className="shift-section" aria-label={ja ? "シフト管理" : "Shift management"}>
            <h2>{ja ? "シフト管理" : "Shift Management"}</h2>
            {lookup.status === "loading" ? <p role="status">{ja ? "シフトを確認中…" : "Checking active shift…"}</p>
                : lookup.status === "error" ? <p role="alert">{ja ? "シフトの状態を確認できません。操作できません。" : "Shift status unavailable. Management actions are disabled."}</p>
                    : shift ? <>
                        <div className="shift-status"><span className="shift-status-pill is-on-duty">{stale
                            ? (ja ? "前のシフト・要復旧" : "Previous shift — recovery needed")
                            : (ja ? "営業中 — 参加できます" : "Already open — join shift")}</span>
                            <small>{shift.business_date} · #{shift.id}</small></div>
                        <p>{ja ? "開始" : "Started"} {formatTime(shift.opened_at)} JST · {shift.opened_by}</p>
                        {stale ? <>
                            <p className="shift-alert" role="alert">{ja
                                ? "前の営業日のシフトです。新しい営業として参加せず、営業日、未会計伝票、勤務時間を確認して復旧してください。"
                                : "This shift belongs to a previous business day. Do not join it as tonight's shift; review its tickets and staff hours before recovery."}</p>
                            {account.role === "manager" ? <button type="button" className="danger" disabled={!!pending} onClick={reviewClose}>
                                {ja ? "確認して復旧する" : "Review & recover shift"}
                            </button> : <p className="shift-muted">{ja ? "復旧は管理者に依頼してください。" : "Ask a manager to review and recover this shift."}</p>}
                        </> : <div className="shift-action-row">
                            <button type="button" className="danger" disabled={!!pending} onClick={reviewClose}>
                                {ja ? "閉店前の確認" : "Review & Close Shift"}
                            </button>
                        </div>}
                    </> : staleInfo ? <>
                        <p className="shift-alert" role="alert">{ja
                            ? "前の営業日のシフト（" + staleInfo.businessDate + "、#" + staleInfo.shiftId + "）がまだ開いています。管理者が内容を確認して復旧するまで新しい営業は開始できません。"
                            : "The previous shift (" + staleInfo.businessDate + ", #" + staleInfo.shiftId + ") is still open. A manager must review and recover it before another shift can start."}</p>
                        <button type="button" className="hollow secondary" onClick={() => void refresh()}>{ja ? "シフトを再読み込み" : "Reload shift details"}</button>
                    </> : <>
                        <p>{ja ? "今日の営業日" : "Current business date"}: {today}</p>
                        {closedToday ? <>
                            <div className="shift-status"><span className="shift-status-pill">{ja ? "本日閉店済み" : "Closed for today"}</span>
                                <small>{closedToday.business_date} · #{closedToday.id}</small></div>
                            <p>{ja ? "最終閉店" : "Last closed"} {closedToday.closed_at ? formatTime(closedToday.closed_at) + " JST" : ""} · {closedToday.closed_by ?? "—"}</p>
                            {account.role === "manager" ? <div className="shift-reopen-review">
                                <strong>{ja ? "シフトを再開する前に確認" : "Review before reopening this shift"}</strong>
                                <p>{ja
                                    ? "再開すると、前回の閉店記録と集計は監査履歴に保存されます。営業中の合計は0から始まり、次回の閉店時にシフト全体の有効な支払いから再計算されます。伝票や打刻は変更されません。"
                                    : "Reopening preserves the previous close and totals in the audit history. Active totals reset to zero and are recalculated from the shift's active payments at the next close. Tickets and punches are not rewritten."}</p>
                                <p className="shift-muted">{ja ? "前回の閉店合計" : "Previous close totals"}: {yen(closedToday.paid_total)}
                                    {" · "}{ja ? "現金" : "Cash"} {yen(closedToday.cash_total)}
                                    {" · "}{ja ? "カード" : "Card"} {yen(closedToday.card_total)}
                                    {" · "}{ja ? "その他" : "Other"} {yen(closedToday.other_total)}</p>
                                <label className="shift-reopen-reason"><span>{ja ? "再開理由" : "Reason for reopening"}</span>
                                    <textarea value={reopenReason} maxLength={255} rows={3} required onChange={event => setReopenReason(event.target.value)}
                                        placeholder={ja ? "理由を入力してください" : "Enter a reason"} />
                                </label>
                                <label className="shift-ack">
                                    <input type="checkbox" checked={reopenConfirmed} disabled={!!pending} onChange={event => setReopenConfirmed(event.target.checked)} />
                                    <span>{ja ? "この営業日のシフトを再開し、閉店集計を再計算することを確認しました。" : "I confirm reopening this business shift and recalculating its close totals."}</span>
                                </label>
                                <button type="button" className="success" disabled={!!pending || !reopenConfirmed || !reopenReason.trim()} onClick={() => void perform("reopen")}>
                                    {pending === "reopen" ? (ja ? "再開中…" : "Reopening…") : (ja ? "理由を記録して再開" : "Record reason & reopen shift")}
                                </button>
                            </div> : <p className="shift-muted">{ja
                                ? "本日のシフトは閉店済みです。再開には管理者の確認と理由の記録が必要です。"
                                : "Today's shift is closed. A manager must confirm and record a reason before reopening."}</p>}
                        </> : eligibility === "allowed" ? <button type="button" className="success" disabled={!!pending} onClick={() => void perform("open")}>
                            {pending === "open" ? (ja ? "開始中…" : "Starting shift…") : (ja ? "シフトを開始する" : "Start Shift")}
                        </button> : <p className="shift-muted" role="status">{eligibility === "error"
                            ? (ja ? "シフト履歴を確認できません。操作を誤らないよう開始を停止しています。" : "Could not verify shift history. Starting is disabled until the status is known.")
                            : (ja ? "開始可否を確認中…" : "Checking whether it is safe to start…")}</p>}
                    </>}
            {closedSummary ? <div className="shift-closed-summary" role="status">
                <strong>{ja ? "閉店完了" : "Shift successfully closed"}</strong>
                <p>{closedSummary.business_date} · {ja ? "売上" : "Recorded revenue"} {yen(closedSummary.paid_total)}</p>
                <p>{ja ? "現金" : "Cash"} {yen(closedSummary.cash_total)} · {ja ? "カード" : "Card"} {yen(closedSummary.card_total)}</p>
                <button type="button" className="secondary" onClick={() => navigate("/analytics")}>
                    {ja ? "営業レポートを見る" : "View daily report"}
                </button>
            </div> : null}
        </section> : null}
    </>;
}
