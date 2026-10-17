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

export default function ShiftControls({ account, locale }: { account: Account; locale: string }) {
    const ja = locale === "ja";
    const navigate = useNavigate();
    const { openModal } = useModal();
    const [lookup, setLookup] = useState<Lookup>({ status: "loading", shift: null });
    const [eligibility, setEligibility] = useState<OpenEligibility>("checking");
    const [pending, setPending] = useState<"" | "open" | "clock-in" | "clock-out">("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [closedSummary, setClosedSummary] = useState<ShiftReport | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const version = useRef(0);
    const mounted = useRef(true);
    const mutation = useRef(false);
    const roleCanManage = canManageShift(account.role);
    const today = businessDateJst(now);
    const shift = lookup.status === "ready" ? lookup.shift : null;
    const activePunch = currentPunch(shift, account.id);
    const stale = Boolean(shift && shift.business_date !== today);
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
            if (!current && account.role === "manager") {
                // Existing POST /shifts/open silently reopens a closed same-day shift.
                // Refuse to use it until a read-only history check has ruled that out.
                setEligibility("checking");
                try {
                    const history = await accountApi.closedShifts();
                    if (!mounted.current || request !== version.current || mutation.current) return;
                    const today = businessDateJst(Date.now());
                    setEligibility(history.some(row => row.business_date === today && row.status === "closed")
                        ? "closed-today" : "allowed");
                } catch {
                    if (!mounted.current || request !== version.current || mutation.current) return;
                    setEligibility("error");
                }
            } else setEligibility(current ? "checking" : "allowed");
            if (mounted.current && request === version.current && !mutation.current) {
                setLookup({ status: "ready", shift: current });
            }
        } catch {
            if (mounted.current && request === version.current && !mutation.current) {
                setLookup({ status: "error", shift: null });
                setEligibility("error");
            }
        }
    }, [account.role]);

    useEffect(() => {
        mounted.current = true;
        void refresh();
        const poll = window.setInterval(() => void refresh(), 20000);
        const tick = window.setInterval(() => setNow(Date.now()), 15000);
        const onRefresh = () => void refresh();
        window.addEventListener("focus", onRefresh);
        window.addEventListener("barticket-api-restored", onRefresh);
        window.addEventListener("barticket-shift-updated", onRefresh);
        return () => {
            mounted.current = false;
            version.current++;
            window.clearInterval(poll);
            window.clearInterval(tick);
            window.removeEventListener("focus", onRefresh);
            window.removeEventListener("barticket-api-restored", onRefresh);
            window.removeEventListener("barticket-shift-updated", onRefresh);
        };
    }, [refresh]);

    async function perform(action: "open" | "clock-in" | "clock-out") {
        if (mutation.current || lookup.status !== "ready") return;
        if (action === "open" && (shift || !roleCanManage || eligibility !== "allowed")) return;
        if (action !== "open" && (!shift || (stale && action !== "clock-out"))) return;
        // A staff account cannot query manager-only shift history. Keep existing
        // shift-opening access for solo coverage, but explicitly warn that the
        // legacy API may reopen a previously closed same-day shift.
        if (action === "open" && account.role === "staff" &&
            !window.confirm(ja
                ? "現在のAPIでは、すでに終了した本日のシフトが再開される可能性があります。営業日を確認してから開始しますか？"
                : "The current API may reopen a shift already closed today. Confirm the business date before starting. Continue?")) return;
        mutation.current = true;
        version.current++;
        setPending(action);
        setNotice("");
        setError("");
        setClosedSummary(null);
        try {
            if (action === "open") {
                // Advisory checks only; backend #86/#89 must enforce access and
                // a proper separate reopen action under concurrent requests.
                const current = await accountApi.currentShift();
                if (current) {
                    if (mounted.current) {
                        setLookup({ status: "ready", shift: current });
                        setNotice(ja ? "シフトはすでに営業中です。勤務時間を記録するには出勤してください。" : "The shift is already open. Clock in to record your working time.");
                    }
                    return;
                }
                if (account.role === "manager") {
                    const history = await accountApi.closedShifts();
                    if (history.some(row => row.business_date === businessDateJst(Date.now()) && row.status === "closed")) {
                        if (mounted.current) {
                            setEligibility("closed-today");
                            setError(ja ? "本日の営業は閉店済みです。再開には専用のAPIが必要です。" : "This business date has already been closed. Reopening requires the dedicated API.");
                        }
                        return;
                    }
                }
            }
            const result = action === "open" ? await accountApi.openShift()
                : action === "clock-in" ? await accountApi.clockIn() : await accountApi.clockOut();
            if (!mounted.current) return;
            setLookup({ status: "ready", shift: result });
            setNotice(action === "open"
                ? (ja ? "営業を開始しました。勤務を記録するには次に出勤を押してください。" : "Shift opened. Clock in next to record your working hours.")
                : action === "clock-in" ? (ja ? "出勤を記録しました。" : "Clock-in recorded.")
                    : (ja ? "退勤を記録しました。" : "Clock-out recorded."));
            window.dispatchEvent(new Event("barticket-shift-updated"));
        } catch (err) {
            if (!mounted.current) return;
            const unknown = !(err instanceof ApiError);
            setError(unknown
                ? (ja ? "通信エラーのため結果が不明です。自動で再送信せず、サーバーの状態を再確認します。" : "Connection interrupted. The result may have committed. This action will not be resent automatically.")
                : (ja ? "操作できません。シフト状態と権限を確認してください。" : "Action rejected. Check your permissions and shift state.") + " (" + err.message + ")");
            setLookup({ status: "loading", shift: null });
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
            title: ja ? "閉店前の確認" : "Review & close shift",
            closeStyle: "icon",
            fitContent: true,
            maxWidth: "620px",
            content: <ShiftCloseReview shiftId={shift.id} locale={locale} onClosed={onClosed} />,
        });
    }

    return <>
        <section className="shift-section" aria-label={ja ? "自分のタイムカード" : "My time clock"}>
            <h2>{ja ? "自分のタイムカード" : "My Time Clock"}</h2>
            {lookup.status === "loading" ? <p role="status">{ja ? "勤務状況を確認中…" : "Checking your work status…"}</p>
                : lookup.status === "error" ? <p role="alert">{ja ? "勤務状況を取得できません。出退勤の操作は確認まで停止しています。" : "Could not verify your work status. Clock controls are unavailable until verified."}</p>
                    : <div className="shift-status">
                        <span className={"shift-status-pill" + (activePunch ? " is-on-duty" : "")}>
                            {activePunch ? (ja ? "勤務中" : "Clocked in") : (ja ? "勤務時間の記録なし" : "Not clocked in")}
                        </span>
                        {shift ? <small>{ja ? "営業日" : "Business date"}: {shift.business_date}</small> : null}
                    </div>}
            {shift && !stale ? <div className="shift-card-details">
                <div><small>{ja ? "出勤時刻" : "Clocked in at"}</small>
                    <strong>{activePunch ? formatTime(activePunch.clock_in) : "—"}</strong></div>
                <div><small>{ja ? "記録された勤務時間" : "Recorded time"}</small>
                    <strong>{formatHours(workedSeconds(shift, account.id, now / 1000))}</strong></div>
            </div> : null}
            {stale ? <p className="shift-alert" role="alert">{ja
                ? "前の営業日のシフトがまだ開いています。新しい勤務記録を作る前にシフトを確認してください。"
                : "A previous business day's shift is still open. Review it before recording new hours."}</p> : null}
            {lookup.status === "ready" && !shift ? <p className="shift-muted">{ja ? "営業中のシフトがありません。開始権限のある担当者がシフトを開く必要があります。" : "No shift is open. An authorized shift lead must open one before staff can clock in."}</p> : null}
            {lookup.status === "ready" && shift && (!stale || Boolean(activePunch)) ? <div className="shift-action-row">
                <button type="button" className="secondary" disabled={!!pending}
                    onClick={() => void perform(activePunch ? "clock-out" : "clock-in")}>
                    {pending ? (ja ? "記録中…" : "Recording…") : activePunch ? (ja ? "退勤" : "Clock Out") : (ja ? "出勤" : "Clock In")}
                </button>
            </div> : null}
            <p className="shift-muted">{ja ? "勤務時間はサーバーの出退勤記録から表示しています。" : "Working time is calculated from recorded server punches."}</p>
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
                        <div className="shift-status"><span className="shift-status-pill is-on-duty">{ja ? "営業中" : "Shift open"}</span>
                            <small>{shift.business_date} · #{shift.id}</small></div>
                        <p>{ja ? "開始" : "Started"} {formatTime(shift.opened_at)} JST · {shift.opened_by}</p>
                        <div className="shift-action-row">
                            <button type="button" className="danger" disabled={!!pending} onClick={reviewClose}>
                                {ja ? "閉店前の確認" : "Review & Close Shift"}
                            </button>
                        </div>
                        {stale ? <p className="shift-alert" role="alert">{ja
                            ? "前の営業日のシフトです。営業日とスタッフの勤務時間を確認してから閉店してください。"
                            : "This shift belongs to a previous business day. Review the date and recorded staff hours before closing it."}</p> : null}
                    </> : <>
                        <p>{ja ? "今日の営業日" : "Current business date"}: {today}</p>
                        {eligibility === "allowed" ? <button type="button" className="success" disabled={!!pending} onClick={() => void perform("open")}>
                            {pending === "open" ? (ja ? "開店処理中…" : "Opening shift…") : (ja ? "シフトを開始する" : "Start Shift")}
                        </button> : <p className="shift-muted" role="status">{eligibility === "closed-today"
                            ? (ja ? "本日のシフトは閉店済みです。再開には専用APIと記録が必要です。" : "This business date was already closed. Reopening is disabled until the audited backend workflow exists.")
                            : eligibility === "error" ? (ja ? "過去のシフトを確認できません。誤った再開を防ぐため開始を停止しています。" : "Could not verify shift history. Starting a shift is disabled to prevent accidental reopening.")
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
