import { useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import styled from "styled-components";
import { scheduledShiftsApi, type ScheduledShift, type ScheduledPerson, type ScheduleContext } from "../api/scheduledShifts";
import { accountApi, type Account } from "../api/account";
import { timeOffApi, type TimeOffRequest } from "../api/timeOff";
import { getToken } from "../api/client";
import { shouldPoll } from "../api/realtime";
import { businessDateJst } from "./shiftControlPolicy";
import { useI18n } from "../i18n";
import { addDays, calendarDays, changeMonth, monthRange, weekDays, weekRange } from "./scheduleCalendar";
import { createScheduleReadStore } from "./scheduleReadStore";
import ScheduleEditor from "./ScheduleEditor";
import TabGroup from "../components/TabGroup";
import Icon from "../components/Icon";

type ScheduleState = "active" | "finished" | "closed" | "event" | "past" | "planned";
// Use the app's semantic palette consistently in Month, Week and day details.
const scheduleAccent = (state: ScheduleState) => state === "active" ? "var(--success)"
    : state === "planned" ? "var(--primary)" : state === "event" ? "var(--info)"
    : state === "closed" ? "var(--danger)" : "var(--neutral-500)";
const scheduleForeground = (state: ScheduleState) => state === "active" ? "var(--success-300)"
    : state === "planned" ? "var(--royal-300)" : state === "event" ? "var(--info-300)"
    : state === "closed" ? "var(--danger-300)" : "var(--neutral-300)";
const scheduleSurface = (state: ScheduleState) => state === "active" ? "var(--success-900)"
    : state === "planned" ? "var(--royal-900)" : state === "event" ? "var(--info-900)"
    : state === "closed" ? "var(--danger-900)" : "var(--neutral-900)";
const retireTimeOffActions = (lifecycle: { current: number }, actionSerial: { current: number }) => {
    lifecycle.current++;
    actionSerial.current++;
};

const store = createScheduleReadStore(scheduledShiftsApi.list);
export default function Schedules() {
    const { locale } = useI18n();
    const ja = locale === "ja";
    const t = useCallback((en: string, jp: string) => ja ? jp : en, [ja]);
    const [calendarToday, setCalendarToday] = useState(() => businessDateJst(Date.now()));
    const calendarTodayRef = useRef(calendarToday);
    const [scheduleContext, setScheduleContext] = useState<ScheduleContext | null>(null);
    const [month, setMonth] = useState(() => businessDateJst(Date.now()).slice(0, 7));
    const [selected, setSelected] = useState(() => businessDateJst(Date.now()));
    const [mode, setMode] = useState<"month" | "week" | "day">(() => window.matchMedia("(max-width: 600px)").matches ? "week" : "month");
    const [rows, setRows] = useState<ScheduledShift[]>([]);
    const today = scheduleContext?.operational_business_date ?? calendarToday;
    const calendarDate = scheduleContext?.calendar_business_date ?? calendarToday;
    const [knownManagers, setKnownManagers] = useState<ScheduledPerson[]>([]);
    const detailPanel = useRef<HTMLElement>(null);
    const [viewer, setViewer] = useState<Account | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
    const [timeOffReason, setTimeOffReason] = useState("");
    const [timeOffBusy, setTimeOffBusy] = useState(false);
    const [timeOffError, setTimeOffError] = useState("");
    const [timeOffMessage, setTimeOffMessage] = useState("");
    const timeOffLifecycle = useRef(0);
    const timeOffActionSerial = useRef(0);
    const handledDeepLink = useRef("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [editing, setEditing] = useState(false);
    const [creating, setCreating] = useState(false);
    const [detail, setDetail] = useState(false);
    const detailReturnFocus = useRef<HTMLElement | null>(null);
    const [authState, setAuthState] = useState(() => ({ token: getToken(), epoch: 0 }));
    const session = authState.token;
    const authEpoch = authState.epoch;
    const serial = useRef(0);
    const authSerial = useRef(0);
    const contextSerial = useRef(0);
    const contextFlight = useRef<{ session: string; serial: number; rerun: boolean } | null>(null);
    const contextEffectActive = useRef(false);
    const dateButtons = useRef(new Map<string, HTMLButtonElement>());
    const pendingDateFocus = useRef<string | null>(null);
    // Only a Day selection awaiting authoritative context may follow its first result.
    const pendingDayDefault = useRef<number | null>(null);
    const { from, to } = mode === "day" ? { from: selected, to: selected } : mode === "week" ? weekRange(selected) : monthRange(month);
    useEffect(() => {
        timeOffLifecycle.current++;
        return () => retireTimeOffActions(timeOffLifecycle, timeOffActionSerial);
    }, []);
    const load = useCallback(async (force = false) => {
        if (authEpoch !== authSerial.current || !session || session !== getToken() || document.hidden || !navigator.onLine) return;
        const request = ++serial.current;
        try {
            const result = await store.load(session, from, to, force);
            if (request !== serial.current || getToken() !== session) return;
            setRows(result); setError("");
            setKnownManagers(current => { const all = [...current, ...result.flatMap(row => row.manager ? [row.manager] : [])]; return [...new Map(all.map(person => [`${person.user_id}:${person.name}`, person])).values()]; });
        } catch (err) {
            if (request !== serial.current || getToken() !== session) return;
            setError(err instanceof Error ? err.message : String(err));
        } finally { if (request === serial.current && getToken() === session) setLoading(false); }
    }, [from, to, session, authEpoch]);
    const loadRef = useRef(load);
    useEffect(() => { loadRef.current = load; }, [load]);
    useEffect(() => {
        const initial = window.setTimeout(() => { setLoading(true); setRows([]); void load(); }, 0);
        // Retire old range reads immediately when switching Month/Week/Day or dates.
        const retire = () => { serial.current++; };
        return () => { clearTimeout(initial); retire(); };
    }, [load]);
    useEffect(() => {
        let active = true;
        const requestAuth = authSerial.current;
        void accountApi.me().then(user => { if (active && requestAuth === authSerial.current && session === getToken()) setViewer(user); }).catch(() => { if (active && requestAuth === authSerial.current) setViewer(null); });
        return () => { active = false; };
    }, [session, authEpoch]);
    const deepLinkRequestId = (() => {
        const value = searchParams.get("time_off");
        return value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
    })();
    useEffect(() => {
        if (!viewer || !session || session !== getToken()) return;
        if (deepLinkRequestId === null) handledDeepLink.current = "";
        let active = true;
        let refreshSerial = 0;
        const refreshRequests = () => {
            const request = ++refreshSerial;
            const requestEpoch = authSerial.current;
            const isCurrent = () => active && request === refreshSerial && requestEpoch === authSerial.current && requestEpoch === authEpoch && session === getToken();
            if (!isCurrent()) return;
            void timeOffApi.requests().then(items => { if (isCurrent()) setTimeOff(items); })
                .catch(error => { if (isCurrent()) setTimeOffError(error instanceof Error ? error.message : String(error)); });
        };
        refreshRequests();
        const refresh = () => refreshRequests();
        window.addEventListener("barticket-time-off-updated", refresh);
        window.addEventListener("barticket-schedules-updated", refresh);
        if (deepLinkRequestId && handledDeepLink.current !== `${session}:${deepLinkRequestId}`) {
            handledDeepLink.current = `${session}:${deepLinkRequestId}`;
            const requestEpoch = authSerial.current;
            const isCurrent = () => active && requestEpoch === authSerial.current && requestEpoch === authEpoch && session === getToken();
            void timeOffApi.request(deepLinkRequestId).then(item => {
                if (!isCurrent()) return;
                setTimeOff(current => [item, ...current.filter(existing => existing.id !== item.id)]);
                setSelected(item.business_date);
                setMonth(item.business_date.slice(0, 7));
                setDetail(true);
                setTimeOffError("");
            }).catch(() => {
                if (isCurrent()) setTimeOffError(t("This time-off request is unavailable for your account.", "この休暇申請は現在のアカウントでは表示できません。"));
            }).finally(() => {
                if (isCurrent()) {
                    const next = new URLSearchParams(searchParams);
                    next.delete("time_off"); next.delete("from_push"); setSearchParams(next, { replace: true });
                }
            });
        }
        return () => {
            active = false;
            window.removeEventListener("barticket-time-off-updated", refresh);
            window.removeEventListener("barticket-schedules-updated", refresh);
        };
    }, [viewer, session, authEpoch, deepLinkRequestId, searchParams, setSearchParams, locale, t]);
    useEffect(() => {
        const reset = (event: Event) => {
            if (event instanceof StorageEvent && event.key !== null && event.key !== "barticket_token") return;
            // Capture every event synchronously. Comparing to rendered state loses
            // A→B→A events batched before a render; same-token auth still retires reads.
            const nextToken = getToken();
            authSerial.current++;
            serial.current++;
            contextSerial.current++;
            contextFlight.current = null;
            store.reset(nextToken);
            setAuthState(current => ({ token: nextToken, epoch: current.epoch + 1 }));
            setRows([]); setKnownManagers([]); setViewer(null); setScheduleContext(null); setEditing(false); setDetail(false);
            pendingDayDefault.current = null;
            timeOffActionSerial.current++;
            setTimeOff([]); setTimeOffReason(""); setTimeOffBusy(false); setTimeOffError(""); setTimeOffMessage(""); handledDeepLink.current = "";
        };
        window.addEventListener("barticket-auth", reset); window.addEventListener("storage", reset);
        return () => { window.removeEventListener("barticket-auth", reset); window.removeEventListener("storage", reset); };
    }, [session, authEpoch]);
    useEffect(() => {
        if (detail && window.matchMedia("(max-width: 900px)").matches) { detailPanel.current?.scrollIntoView({ block: "nearest" }); detailPanel.current?.focus({ preventScroll: true }); }
    }, [detail, selected]);
    useEffect(() => {
        // StrictMode replays effects after cleanup while preserving refs. Keep
        // the shared flight through that replay so the second setup coalesces
        // with the first request instead of issuing a duplicate.
        contextEffectActive.current = true;
        const retire = () => { serial.current++; };
        const updateCalendarToday = () => {
            const next = businessDateJst(Date.now());
            const rolled = calendarTodayRef.current !== next;
            calendarTodayRef.current = next;
            setCalendarToday(next);
            return rolled;
        };
        const requestContext = (rerunInFlight = true) => {
            if (!contextEffectActive.current || authEpoch !== authSerial.current || !session || session !== getToken() || document.hidden || !navigator.onLine) return;
            const inFlight = contextFlight.current;
            if (inFlight?.session === session) { if (rerunInFlight) inFlight.rerun = true; return; }
            const request = ++contextSerial.current;
            const flight = { session, serial: request, rerun: false };
            contextFlight.current = flight;
            void scheduledShiftsApi.context().then(context => {
                if (contextEffectActive.current && contextFlight.current === flight && flight.serial === contextSerial.current && authEpoch === authSerial.current && session === getToken() && !document.hidden && navigator.onLine) {
                    setScheduleContext(context);
                    if (pendingDayDefault.current === authSerial.current) {
                        pendingDayDefault.current = null;
                        setSelected(context.operational_business_date);
                        setMonth(context.operational_business_date.slice(0, 7));
                    }
                }
            }).catch(() => {
                if (contextEffectActive.current && contextFlight.current === flight && flight.serial === contextSerial.current && authEpoch === authSerial.current && session === getToken()) setScheduleContext(null);
            }).finally(() => {
                if (contextFlight.current !== flight) return;
                contextFlight.current = null;
                if (flight.rerun) requestContext();
            });
        };
        const refresh = () => {
            updateCalendarToday();
            requestContext();
            void loadRef.current(true);
        };
        const pollFallback = () => {
            // Keep the local operational-day clock current while sockets are
            // healthy, but only use the minute timer for network recovery.
            const rolled = updateCalendarToday();
            const polling = shouldPoll();
            if (!polling && !rolled) return;
            requestContext();
            if (polling) {
                void loadRef.current(true);
                window.dispatchEvent(new Event("barticket-time-off-updated"));
            }
        };
        const changed = () => { serial.current++; store.invalidate(); requestContext(); void loadRef.current(true); };
        requestContext(false);
        const interval = window.setInterval(pollFallback, 60000);
        window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
        document.addEventListener("visibilitychange", refresh); window.addEventListener("barticket-schedules-updated", changed); window.addEventListener("barticket-shift-updated", changed);
        return () => {
            contextEffectActive.current = false;
            retire();
            clearInterval(interval);
            window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("barticket-schedules-updated", changed); window.removeEventListener("barticket-shift-updated", changed);
        };
    }, [authEpoch, session]);
    const format = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(ja ? "ja-JP" : "en-US", { ...options, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
    const navigate = (amount: number) => {
        pendingDayDefault.current = null;
        const next = mode === "day" ? addDays(selected, amount) : mode === "week" ? addDays(selected, amount * 7) : `${changeMonth(month, amount)}-01`;
        setMonth(next.slice(0, 7)); setSelected(next); setDetail(false);
    };
    const changeView = (next: "month" | "week" | "day") => {
        pendingDayDefault.current = next === "day" && !scheduleContext ? authSerial.current : null;
        const day = next === "day" ? today : selected;
        setMonth(day.slice(0, 7)); setSelected(day); setMode(next);
        if (next === "day") { setDetail(false); setEditing(false); setCreating(false); }
    };
    const moveDateFocus = (event: KeyboardEvent<HTMLButtonElement>, day: string) => {
        const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
        const next = event.key === "Home" ? weekRange(day).from : event.key === "End" ? weekRange(day).to : delta ? addDays(day, delta) : null;
        if (!next) return;
        event.preventDefault();
        pendingDayDefault.current = null;
        pendingDateFocus.current = next;
        setSelected(next);
        if (mode === "week" || !dateButtons.current.has(next)) setMonth(next.slice(0, 7));
        dateButtons.current.get(next)?.focus();
    };
    useEffect(() => {
        if (!pendingDateFocus.current) return;
        dateButtons.current.get(pendingDateFocus.current)?.focus();
        pendingDateFocus.current = null;
    }, [mode, selected, month]);
    const choose = (day: string, trigger?: HTMLElement) => {
        pendingDayDefault.current = null;
        if (trigger) detailReturnFocus.current = trigger;
        setSelected(day); setDetail(true); if (!day.startsWith(month)) setMonth(day.slice(0, 7));
    };
    const closeDetails = () => {
        setDetail(false);
        detailReturnFocus.current?.focus();
    };
    const selectedRow = rows.find(row => row.business_date === selected);
    const selectedTimeOff = timeOff.filter(item => item.business_date === selected);
    const managerReviewOpen = viewer?.role === "manager" && detail && selectedTimeOff.some(item => item.status === "pending");
    const myTimeOffRequests = viewer?.role === "staff" ? selectedTimeOff.filter(item => item.requester_user_id === viewer.id) : [];
    const myPendingTimeOffRequest = myTimeOffRequests.find(item => item.status === "pending");
    const latestMyTimeOffRequest = myTimeOffRequests[0];
    const staffAssignedToSelected = !!selectedRow && viewer?.role === "staff" && selectedRow.staff.some(person => person.user_id === viewer.id);
    const isActiveShiftDate = (day: string) => scheduleContext?.actual_shift_status === "open" && scheduleContext.actual_shift_business_date === day;
    const selectedIsPast = (selected < calendarDate && !isActiveShiftDate(selected)) || selectedRow?.actual_shift_status === "closed" || (scheduleContext?.actual_shift_status === "closed" && scheduleContext.actual_shift_business_date === selected);
    const createTarget = mode !== "month" || selected.startsWith(month) ? selected : `${month}-01`;
    const createTargetIsPast = (createTarget < calendarDate && !isActiveShiftDate(createTarget)) || (scheduleContext?.actual_shift_status === "closed" && scheduleContext.actual_shift_business_date === createTarget);
    const canRequestTimeOff = staffAssignedToSelected && !selectedIsPast && !!selectedRow?.manager?.user_id &&
        selectedRow?.schedule_type !== "closed" && selectedRow?.venue_status !== "closed" && selectedRow?.actual_shift_status !== "closed";
    const submitTimeOff = async () => {
        if (!selectedRow || !canRequestTimeOff || myPendingTimeOffRequest || timeOffBusy) return;
        const sessionAtStart = getToken();
        const authRequest = authSerial.current;
        const lifecycle = timeOffLifecycle.current;
        const action = ++timeOffActionSerial.current;
        const isCurrent = () => authRequest === authSerial.current && authRequest === authEpoch && sessionAtStart === session && sessionAtStart === getToken() && lifecycle === timeOffLifecycle.current && action === timeOffActionSerial.current;
        if (!sessionAtStart || !isCurrent()) return;
        setTimeOffBusy(true); setTimeOffError(""); setTimeOffMessage("");
        try {
            const created = await timeOffApi.submit(selectedRow.id, timeOffReason);
            if (!isCurrent()) return;
            setTimeOff(current => [created, ...current.filter(item => item.id !== created.id)]);
            setTimeOffReason(""); setTimeOffMessage(t("Your request was sent to the manager assigned to this day.", "この日の担当マネージャーに申請を送信しました。"));
            window.dispatchEvent(new Event("barticket-time-off-updated"));
        } catch (err) { if (isCurrent()) setTimeOffError(err instanceof Error ? err.message : String(err)); }
        finally { if (isCurrent()) setTimeOffBusy(false); }
    };
    const decideTimeOff = async (request: TimeOffRequest, decision: "approve" | "decline") => {
        if (timeOffBusy) return;
        const sessionAtStart = getToken();
        const authRequest = authSerial.current;
        const lifecycle = timeOffLifecycle.current;
        const action = ++timeOffActionSerial.current;
        const isCurrent = () => authRequest === authSerial.current && authRequest === authEpoch && sessionAtStart === session && sessionAtStart === getToken() && lifecycle === timeOffLifecycle.current && action === timeOffActionSerial.current;
        if (!sessionAtStart || !isCurrent()) return;
        setTimeOffBusy(true); setTimeOffError(""); setTimeOffMessage("");
        try {
            const updated = await timeOffApi.decide(request.id, decision, request.revision, request.schedule_revision);
            if (!isCurrent()) return;
            setTimeOff(current => viewer?.role === "manager"
                ? current.filter(item => item.id !== updated.id)
                : current.map(item => item.id === updated.id ? updated : item));
            setTimeOffMessage(decision === "approve" ? t("Approved. The staff member was removed from the planned day.", "承認しました。スタッフを予定から外しました。") : t("Declined. The schedule is unchanged.", "却下しました。予定は変更されていません。"));
            window.dispatchEvent(new Event("barticket-time-off-updated"));
            window.dispatchEvent(new Event("barticket-schedules-updated"));
            await load(true);
        } catch (err) { if (isCurrent()) setTimeOffError(err instanceof Error ? err.message : String(err)); }
        finally { if (isCurrent()) setTimeOffBusy(false); }
    };
    const days = calendarDays(month);
    const visibleDays = mode === "day" ? [selected] : weekDays(selected);
    const weekHasPlans = rows.some(row => row.business_date >= from && row.business_date <= to);
    const rangeLabel = mode === "day" ? format(selected, { year: "numeric", month: "short", day: "numeric" }) : mode === "week"
        ? new Intl.DateTimeFormat(ja ? "ja-JP" : "en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).formatRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`))
        : format(`${month}-01`, { year: "numeric", month: "long" });
    const viewTabs = [
        { id: "month" as const, label: t("Month", "月") },
        { id: "week" as const, label: t("Week", "週") },
        { id: "day" as const, label: t("Day", "日") },
    ];
    const names = (row: ScheduledShift) => [row.manager?.name, ...row.staff.map(person => person.name)].filter(Boolean).join(" · ");
    const cellState = (row: ScheduledShift): ScheduleState => {
        if (row.actual_shift_status === "open") return "active";
        if (row.actual_shift_status === "closed") return "finished";
        const normalizedEvent = row.event_value?.trim().toLocaleLowerCase() ?? "";
        const scheduleType = row.schedule_type ?? (normalizedEvent === "closed" ? "closed" : normalizedEvent === "open" || !normalizedEvent ? "open" : "event");
        if (row.schedule_state === "past" || row.business_date < calendarDate) return "past";
        if (row.venue_status === "closed" || scheduleType === "closed") return "closed";
        if (row.venue_event || scheduleType === "event") return "event";
        return "planned";
    };
    const cellLabel = (row: ScheduledShift) => {
        const state = cellState(row);
        if (state === "active") return t("Active shift", "営業中のシフト");
        if (state === "finished") return t("Finished shift", "終了したシフト");
        if (state === "closed") return row.venue_event ? `${t("Closed", "休業")} · ${row.venue_event}` : t("Closed", "休業");
        if (state === "event") return t("Special event", "特別イベント");
        if (state === "past") {
            const isClosed = row.venue_status === "closed" || row.schedule_type === "closed" || row.event_value?.trim().toLocaleLowerCase() === "closed";
            return isClosed ? `${t("Past", "過去")} · ${t("Closed", "休業")}` : t("Past", "過去");
        }
        return t("Planned shift", "シフト予定");
    };
    const cellTitle = (row: ScheduledShift) => {
        const value = row.event_value?.trim() ?? "";
        const routine = !value || ["open", "shift plan", "予定", "勤務予定"].includes(value.toLocaleLowerCase());
        if (row.schedule_type === "closed") return t("Closed", "休業");
        return row.venue_status === "closed" && routine ? t("Closed", "休業") : value || t("Shift plan", "勤務予定");
    };
    return <Page>
        <Toolbar>
            <div><h1>{t("Schedule", "シフト予定")}</h1><Subtitle>{t("Plans, not clock-in records", "勤務予定（打刻記録とは別）")}</Subtitle></div>
            <ScheduleControls role="group" aria-label={t("Schedule controls", "予定表示の操作")}>
                <TabGroup
                    tabs={viewTabs}
                    activeTab={mode}
                    onChange={changeView}
                    label={t("Calendar view", "表示方法")}
                    semantics="tabs"
                    idPrefix="schedule-view"
                />
            </ScheduleControls>
        </Toolbar>
        <MonthNav $week={mode === "week"} aria-label={mode === "day" ? t("Schedule day", "予定の日") : mode === "week" ? t("Schedule week", "予定の週") : t("Schedule month", "予定の月")}>
            <MonthStep type="button" className="hollow secondary" aria-label={mode === "day" ? t("Previous day", "前日") : mode === "week" ? t("Previous week", "前週") : t("Previous month", "前月")} onClick={() => navigate(-1)}>
                <Icon name="CaretLeft" size="var(--font-size-h4)" />
            </MonthStep>
            <h2 aria-live="polite"><MonthLabel $week={mode === "week"} type="button" aria-label={t("Show month calendar", "月間カレンダーを表示")} onClick={() => changeView("month")}>
                {rangeLabel}
            </MonthLabel></h2>
            <MonthStep type="button" className="hollow secondary" aria-label={mode === "day" ? t("Next day", "翌日") : mode === "week" ? t("Next week", "翌週") : t("Next month", "翌月")} onClick={() => navigate(1)}>
                <Icon name="CaretRight" size="var(--font-size-h4)" />
            </MonthStep>
        </MonthNav>
        {viewer?.role === "manager" && !detail && selectedIsPast ? <ReadOnlyNotice role="status">{t("Past schedule dates are read-only. Choose today or a future date to create a plan.", "過去の予定は閲覧のみです。今日または未来の日付を選んでください。")}</ReadOnlyNotice> : null}
        {viewer?.role === "manager" && !scheduleContext ? <ReadOnlyNotice role="status">{t("Schedule date could not be verified. Editing is temporarily unavailable.", "予定日を確認できません。確認できるまで編集できません。")}</ReadOnlyNotice> : null}
        {error ? <Notice role="alert">{t("Could not refresh schedules. Displayed plans may be out of date.", "予定を更新できませんでした。表示内容が古い場合があります。") } <span>{error}</span><button className="secondary" onClick={() => void load(true)}>{t("Retry", "再試行")}</button></Notice> : null}
        {timeOffError ? <Notice role="alert">{timeOffError}</Notice> : null}
        {timeOffMessage ? <TimeOffStatus role="status">{timeOffMessage}</TimeOffStatus> : null}
        {loading ? <Subtitle role="status">{t("Loading schedules…", "予定を読み込んでいます…")}</Subtitle> : null}
        <Canvas>
            {mode === "month" ? <Calendar id="schedule-view-panel-month" role="tabpanel" aria-labelledby="schedule-view-tab-month" tabIndex={0} aria-label={t("Monthly schedule", "月間予定")}>
                {Array.from({ length: 7 }, (_, i) => <Weekday key={i}>{format(addDays("2026-11-01", i), { weekday: "short" })}</Weekday>)}
                {days.map(day => { const row = rows.find(item => item.business_date === day); const isPast = day < calendarDate && !isActiveShiftDate(day); return <Day key={day} $outside={!day.startsWith(month)} $selected={day === selected} $past={isPast}>
                    <DayButton $past={isPast} ref={node => { if (node) dateButtons.current.set(day, node); else dateButtons.current.delete(day); }} aria-label={format(day, { dateStyle: "full" })} aria-current={day === today ? "date" : undefined} aria-pressed={day === selected} onClick={event => choose(day, event.currentTarget)} onKeyDown={event => moveDateFocus(event, day)}><span>{Number(day.slice(-2))}</span></DayButton>
                    {row ? <EventBlock $state={cellState(row)} onClick={event => choose(day, event.currentTarget)} aria-label={`${day}: ${cellTitle(row)}, ${cellLabel(row)}, ${names(row)}`}><strong>{cellTitle(row)}</strong><span>{cellLabel(row)}</span><small>{row.manager?.name || t("No manager", "担当未定")}</small><small>{row.staff.map(person => person.name).join(" · ") || t("No staff", "スタッフなし")}</small></EventBlock> : null}
                </Day>; })}
            </Calendar> : <Week id={`schedule-view-panel-${mode}`} role="tabpanel" aria-labelledby={`schedule-view-tab-${mode}`} tabIndex={0} aria-label={mode === "day" ? t("Daily schedule", "一日の予定") : t("Weekly schedule", "週間予定")}>
                <WeekNote>{t("Date-only plans · hours not recorded", "日付のみの予定・勤務時間の記録なし")}</WeekNote>
                {mode === "week" && !loading && !weekHasPlans ? <Empty>{t("No scheduled shifts this week.", "今週の予定はありません。")}</Empty> : null}
                {visibleDays.map(day => { const row = rows.find(item => item.business_date === day); const isPast = day < calendarDate && !isActiveShiftDate(day); return <WeekRow key={day} data-date={day} $selected={day === selected}>
                    <WeekDate $past={isPast} ref={node => { if (node) dateButtons.current.set(day, node); else dateButtons.current.delete(day); }} aria-label={format(day, { dateStyle: "full" })} aria-current={day === today ? "date" : undefined} aria-pressed={day === selected} onClick={event => choose(day, event.currentTarget)} onKeyDown={event => moveDateFocus(event, day)}><small>{format(day, { weekday: "short" })}</small><span>{Number(day.slice(-2))}</span><small>{format(day, { month: "short" })}</small></WeekDate>
                    {row ? <WeekEvent $state={cellState(row)} onClick={event => choose(day, event.currentTarget)} aria-label={`${day}: ${cellTitle(row)}, ${cellLabel(row)}, ${names(row)}`}><small>{cellLabel(row)}</small><strong>{cellTitle(row)}</strong><span>{t("Manager", "マネージャー")}: {row.manager?.name || t("Not assigned", "未定")}</span><span>{t("Staff", "スタッフ")}: {row.staff.map(person => person.name).join(" · ") || t("None", "なし")}</span></WeekEvent>
                        : <EmptyDay type="button" aria-label={`${format(day, { dateStyle: "full" })}: ${t("No plan", "予定なし")}`} onClick={event => choose(day, event.currentTarget)}>{loading ? t("Loading…", "読み込み中…") : t("No plan", "予定なし")}</EmptyDay>}
                </WeekRow>; })}
            </Week>}
            {detail ? <Details ref={detailPanel} tabIndex={-1} aria-label={t("Selected day", "選択した日")}>
                <DetailHeader><h2>{format(selected, { month: "long", day: "numeric", weekday: "short" })}</h2><CloseDetailsButton type="button" aria-label={t("Close day details", "詳細を閉じる")} onClick={closeDetails}><Icon name="X" size="var(--font-size-h4)" /></CloseDetailsButton></DetailHeader>
                <h3>{selectedRow ? cellTitle(selectedRow) : t("Shift plan", "勤務予定")}</h3>
                {selectedRow ? <StatusLabel $state={cellState(selectedRow)}>{cellLabel(selectedRow)}</StatusLabel> : null}
                <Subtitle>{t("Date-only plan · hours not recorded", "日付のみの予定・勤務時間の記録なし")}</Subtitle>
                <dl><dt>{t("Manager", "マネージャー")}</dt><dd>{selectedRow?.manager?.name || t("Not assigned", "未定")}</dd><dt>{t("Staff", "スタッフ")}</dt><dd>{selectedRow?.staff.map(person => person.name).join(" · ") || t("None", "なし")}</dd></dl>
                {selectedRow?.actual_shift_exists ? <p>{t("An actual shift is also recorded. Editing this plan does not change it.", "実際のシフト記録があります。予定を変更しても実績は変わりません。")}</p> : null}
                {viewer?.role === "manager" && scheduleContext && !selectedIsPast ? <button onClick={() => { setCreating(!selectedRow); setEditing(true); }}>{selectedRow ? t("Edit plan", "予定を編集") : t("Add plan", "予定を追加")}</button> : null}
                {viewer?.role === "manager" && selectedIsPast ? <ReadOnlyNotice role="status">{t("Past schedule dates are read-only. Historical plans and assignments cannot be changed.", "過去の予定は閲覧のみです。過去の予定や担当者は変更できません。")}</ReadOnlyNotice> : null}
                {viewer?.role === "staff" && (staffAssignedToSelected || myTimeOffRequests.length > 0) ? <TimeOffPanel>
                    <h4>{t("Request time off", "休暇を申請")}</h4>
                    {myPendingTimeOffRequest ? <>
                        <p><strong>{t("Status", "状態")}:</strong> {t("Pending manager review", "マネージャーの確認待ち")}</p>
                        {myPendingTimeOffRequest.reason ? <p>{myPendingTimeOffRequest.reason}</p> : null}
                    </> : <>
                        {latestMyTimeOffRequest ? <p><strong>{t("Last request", "前回の申請")}:</strong> {latestMyTimeOffRequest.status === "approved" ? t("Approved", "承認済み") : latestMyTimeOffRequest.status === "declined" ? t("Declined", "却下") : t("No longer active", "無効")}</p> : null}
                        {canRequestTimeOff ? <>
                        <label htmlFor="time-off-reason">{t("Short reason (optional)", "理由（任意・簡潔に）")}</label>
                        <TimeOffReason id="time-off-reason" maxLength={500} value={timeOffReason} onChange={event => setTimeOffReason(event.target.value)} placeholder={t("You can leave this blank.", "空欄でも申請できます。")} />
                        <p>{t("A reason is optional. Avoid private medical details.", "理由は任意です。医療などの個人的な詳細は書かないでください。")}</p>
                        <button type="button" className="primary" disabled={timeOffBusy} onClick={() => void submitTimeOff()}>{timeOffBusy ? t("Sending…", "送信中…") : t("Send request", "申請を送る")}</button>
                        </> : <p>{!selectedRow ? t("The scheduled day is no longer available.", "この日の予定は表示できません。") : !selectedRow.manager?.user_id ? t("A request is unavailable because no linked manager is assigned to this day.", "この日にリンク済みの担当マネージャーがいないため、申請できません。") : t("Time-off requests are available for future or currently running assigned shifts.", "将来または現在進行中で、担当しているシフトのみ申請できます。")}</p>}
                    </>}
                </TimeOffPanel> : null}
                {viewer?.role === "manager" && selectedTimeOff.length ? <TimeOffPanel>
                    <h4>{t("Time-off requests", "休暇申請")}</h4>
                    {selectedTimeOff.map(request => <TimeOffCard key={request.id}>
                        <strong>{request.requester_name}</strong>
                        {request.reason ? <p>{request.reason}</p> : <p>{t("No reason provided", "理由の記載なし")}</p>}
                        <div><button type="button" className="primary" disabled={timeOffBusy || selectedIsPast} onClick={() => void decideTimeOff(request, "approve")}>{t("Approve", "承認")}</button><button type="button" className="danger" disabled={timeOffBusy || selectedIsPast} onClick={() => void decideTimeOff(request, "decline")}>{t("Decline", "却下")}</button></div>
                    </TimeOffCard>)}
                </TimeOffPanel> : null}
                {selectedRow?.provenance.length ? <details><summary>{t("Spreadsheet source", "勤務表の出典")}</summary>{selectedRow.provenance.map((source, i) => <p key={i}>{source.source_file} · {t("row", "行")} {source.source_row}<br />{source.imported_by}{source.uncertainty ? ` · ${source.uncertainty}` : ""}</p>)}</details> : null}
            </Details> : null}
        </Canvas>
        {viewer?.role === "manager" && scheduleContext && !editing && !createTargetIsPast && !managerReviewOpen ? <CreateButton type="button" onClick={() => { setSelected(createTarget); setCreating(true); setEditing(true); }}>{t("+ Create", "＋ 作成")}</CreateButton> : null}
        {editing && viewer?.role === "manager" && !selectedIsPast ? <ScheduleEditor knownManagers={knownManagers} day={selected} row={creating ? undefined : selectedRow} ja={ja} today={isActiveShiftDate(selected) ? selected : calendarDate} canWrite={!!scheduleContext} onClose={() => setEditing(false)} onSaved={day => { setEditing(false); setSelected(day); setMonth(day.slice(0, 7)); setDetail(true); window.dispatchEvent(new Event("barticket-schedules-updated")); }} /> : null}
    </Page>;
}
const Page = styled.main`width:100%;max-width:1440px;margin:0 auto;padding:16px 0 calc(112px + env(safe-area-inset-bottom, 0px));button{width:auto;min-height:44px;}> :not(header) button:focus-visible,> button:focus-visible{outline:3px solid var(--royal-300);outline-offset:2px;}`;
const Toolbar = styled.header`display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;h1{font-size:21.6px;margin:0}h2{font-size:20px;margin:0} @media(max-width:600px){flex-direction:column;align-items:stretch;gap:8px;>div:first-child{width:100%;min-width:0;flex:0 0 auto}h1{font-size:19.2px}}`;
const Subtitle = styled.p`color:var(--neutral-300);font-size:13.6px;margin:4px 0;`;
const ScheduleControls = styled.div`align-self:stretch;flex:0 0 100%;min-width:0;max-width:100%;width:100%;`;
const MonthNav = styled.nav<{ $week: boolean }>`display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;gap:var(--space-1);min-height:48px;width:min(100%,${p=>p.$week?'460px':'300px'});margin:0 auto 16px;h2{display:flex;justify-content:center;min-width:0;text-align:center;}`;
const MonthStep = styled.button`width:44px!important;min-width:44px;padding:0!important;border-radius:50%;`;
const MonthLabel = styled.button<{ $week: boolean }>`width:max-content!important;min-width:0;max-width:100%;flex:0 1 auto;padding:var(--space-1) var(--space-2)!important;background:var(--neutral-800)!important;border:1px solid var(--neutral-700)!important;border-radius:999px!important;color:var(--neutral-050)!important;white-space:${p=>p.$week?'normal':'nowrap'};overflow:hidden;text-overflow:ellipsis;font-size:var(--font-size-default);`;
const ReadOnlyNotice = styled.p`margin:8px 0;padding:var(--space-1) var(--space-2);border:1px solid var(--neutral-700);border-radius:var(--space-1);background:var(--neutral-900);color:var(--neutral-200);font-size:var(--font-size-small);`;
const CreateButton = styled.button`position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:80;min-width:112px;padding:var(--space-1) var(--space-2);box-shadow:0 4px 18px rgb(0 0 0 / 38%);border-radius:999px;@media(min-width:769px){right:max(calc((100vw - 1440px)/2),24px);}`;
const Canvas = styled.div`display:flex;align-items:stretch;background:var(--neutral-900);border:1px solid var(--neutral-700);border-radius:16px;overflow:hidden;@media(max-width:900px){flex-direction:column;}`;
const Calendar = styled.div`display:grid;grid-template-columns:repeat(7,minmax(0,1fr));flex:1;min-width:0;`;
const Weekday = styled.div`padding:12.8px 3.2px;text-align:center;font-size:12.8px;color:var(--neutral-300);border-bottom:1px solid var(--neutral-700);`;
const Day = styled.div<{ $outside: boolean; $selected: boolean; $past: boolean }>`min-width:0;min-height:135px;border-right:1px solid var(--neutral-700);border-bottom:1px solid var(--neutral-700);padding:4px;background:${p=>p.$selected?'var(--neutral-800)':p.$outside?'var(--neutral-950)':'transparent'};${p=>p.$past?"color:var(--neutral-300);":""}@media(max-width:600px){min-height:110px;padding:1.6px;}`;
const DayButton = styled.button<{ $past: boolean }>`display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px!important;padding:0!important;margin:0 auto 3.2px;background:transparent!important;color:${p=>p.$past?"var(--neutral-400)":"var(--neutral-100)"}!important;span{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;} &[aria-current=date] span{background:var(--royal-500);color:white;} &[aria-pressed=true] span{outline:1px solid var(--neutral-300);}`;
const EventBlock = styled.button<{ $state: ScheduleState }>`display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%!important;padding:6.4px 8px!important;border:0;border-left:3px solid ${p=>scheduleAccent(p.$state)};border-radius:5px;background:${p=>scheduleSurface(p.$state)}!important;color:var(--neutral-100)!important;text-align:left;font-size:12.8px;overflow:hidden;strong,span,small{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}small{font-size:12px;}span{font-weight:600;color:${p=>scheduleForeground(p.$state)};}@media(max-width:600px){padding:4.8px 3.2px!important;font-size:12px;small{font-size:12px;}}`;
const Week = styled.div`flex:1;min-width:0;padding:12px 16px;@media(max-width:600px){padding:8px;}`;
const WeekNote = styled(Subtitle)`padding:0 8px 8px;`;
const WeekRow = styled.article<{ $selected: boolean }>`display:flex;align-items:stretch;gap:8px;min-width:0;padding:8px 0;border-top:1px solid var(--neutral-700);background:${p=>p.$selected?'var(--neutral-800)':'transparent'};`;
const WeekDate = styled(DayButton)`flex:0 0 56px;flex-direction:column;gap:2px;align-self:flex-start;margin:4px 0!important;padding:4px!important;small{font-size:12px;line-height:1.4;}`;
const EmptyDay = styled.button`flex:1;min-width:0;justify-content:flex-start;padding:12px!important;background:transparent!important;color:var(--neutral-300)!important;text-align:left;white-space:normal;`;
const WeekEvent = styled.button<{ $state: ScheduleState }>`overflow-wrap:anywhere;display:flex;flex:1;min-width:0;align-items:flex-start;flex-direction:column;gap:4px;padding:13.6px 16px!important;background:${p=>scheduleSurface(p.$state)}!important;color:var(--neutral-100)!important;border-left:3px solid ${p=>scheduleAccent(p.$state)};border-radius:8px;text-align:left;strong{font-size:16.8px;}small{color:${p=>scheduleForeground(p.$state)};}span{font-size:13.6px;overflow-wrap:anywhere;}`;
const Details = styled.aside`overflow-wrap:anywhere;width:320px;max-width:100%;flex-shrink:0;padding:20px;border-left:1px solid var(--neutral-700);h2{font-size:16.8px;}h3{margin:16px 0 4.8px;}dl{margin:16px 0;}dt{font-size:12.8px;color:var(--neutral-300);margin-top:16px;}dd{margin:3.2px 0;}p,details{font-size:12.8px;color:var(--neutral-300);overflow-wrap:anywhere;}details{margin-top:19.2px;}summary{cursor:pointer;min-height:44px;}@media(max-width:900px){width:auto;border-left:0;border-bottom:1px solid var(--neutral-700);order:-1;}`;
const StatusLabel = styled.p<{ $state: ScheduleState }>`width:fit-content;max-width:100%;margin:4px 0;padding:6px 10px;border-left:3px solid ${p=>scheduleAccent(p.$state)};border-radius:5px;background:${p=>scheduleSurface(p.$state)};color:${p=>scheduleForeground(p.$state)}!important;`;
const DetailHeader = styled.div`display:flex;align-items:center;justify-content:space-between;gap:8px;`;
const CloseDetailsButton = styled.button`display:grid;place-items:center;flex:0 0 44px;width:44px!important;height:44px;min-height:44px;padding:0!important;background:transparent!important;border:1px solid transparent!important;border-radius:var(--space-1)!important;color:var(--neutral-200)!important;&:hover{background:var(--neutral-800)!important;color:white!important;}`;
const Empty = styled.p`padding:32px;color:var(--neutral-300);text-align:center;`;
const Notice = styled.div`display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:16px;margin-bottom:16px;border:1px solid var(--danger-500);border-radius:8px;span{font-size:12.8px;}`;
const TimeOffStatus = styled.p`margin:8px 0;padding:12px;border:1px solid var(--info-500);border-radius:8px;background:var(--info-950);color:var(--info-200);`;
const TimeOffPanel = styled.section`display:grid;gap:10px;margin:16px 0;padding:12px;border:1px solid var(--info-700);border-radius:10px;background:var(--neutral-950);h4{margin:0;color:var(--info-200);}p{margin:0;font-size:13px;color:var(--neutral-200);}label{font-size:13px;color:var(--neutral-200);}`;
const TimeOffReason = styled.textarea`width:100%;min-height:72px;padding:10px;border:1px solid var(--neutral-600);border-radius:8px;background:var(--neutral-900);color:var(--neutral-100);resize:vertical;font:inherit;`;
const TimeOffCard = styled.article`display:grid;gap:8px;padding:10px;border:1px solid var(--neutral-700);border-radius:8px;background:var(--neutral-900);strong{color:var(--neutral-100);}div{display:flex;gap:8px;flex-wrap:wrap;}button{min-width:104px;}`;
