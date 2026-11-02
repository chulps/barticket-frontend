import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { scheduledShiftsApi, type ScheduledShift, type ScheduledPerson } from "../api/scheduledShifts";
import { accountApi, type Account } from "../api/account";
import { getToken } from "../api/client";
import { businessDateJst } from "./shiftControlPolicy";
import { useI18n } from "../i18n";
import { addDays, calendarDays, changeMonth, monthRange } from "./scheduleCalendar";
import { createScheduleReadStore } from "./scheduleReadStore";
import ScheduleEditor from "./ScheduleEditor";

const store = createScheduleReadStore(scheduledShiftsApi.list);
export default function Schedules() {
    const { locale } = useI18n();
    const ja = locale === "ja";
    const t = (en: string, jp: string) => ja ? jp : en;
    const [today, setToday] = useState(() => businessDateJst(Date.now()));
    const [month, setMonth] = useState(() => businessDateJst(Date.now()).slice(0, 7));
    const [selected, setSelected] = useState(() => businessDateJst(Date.now()));
    const [mode, setMode] = useState<"month" | "agenda">(() => window.matchMedia("(max-width: 600px)").matches ? "agenda" : "month");
    const [rows, setRows] = useState<ScheduledShift[]>([]);
    const [knownManagers, setKnownManagers] = useState<ScheduledPerson[]>([]);
    const detailPanel = useRef<HTMLElement>(null);
    const [viewer, setViewer] = useState<Account | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [editing, setEditing] = useState(false);
    const [creating, setCreating] = useState(false);
    const [detail, setDetail] = useState(false);
    const [authState, setAuthState] = useState(() => ({ token: getToken(), epoch: 0 }));
    const session = authState.token;
    const authEpoch = authState.epoch;
    const serial = useRef(0);
    const authSerial = useRef(0);
    const dateButtons = useRef(new Map<string, HTMLButtonElement>());
    const load = useCallback(async (force = false) => {
        if (authEpoch !== authSerial.current || !session || session !== getToken() || document.hidden || !navigator.onLine) return;
        const request = ++serial.current;
        const { from, to } = monthRange(month);
        try {
            const result = await store.load(session, from, to, force);
            if (request !== serial.current || getToken() !== session) return;
            setRows(result); setError("");
            setKnownManagers(current => { const all = [...current, ...result.flatMap(row => row.manager ? [row.manager] : [])]; return [...new Map(all.map(person => [`${person.user_id}:${person.name}`, person])).values()]; });
        } catch (err) {
            if (request !== serial.current || getToken() !== session) return;
            setError(err instanceof Error ? err.message : String(err));
        } finally { if (request === serial.current && getToken() === session) setLoading(false); }
    }, [month, session, authEpoch]);
    useEffect(() => {
        let active = true;
        const requestAuth = authSerial.current;
        void accountApi.me().then(user => { if (active && requestAuth === authSerial.current && session === getToken()) setViewer(user); }).catch(() => { if (active && requestAuth === authSerial.current) setViewer(null); });
        return () => { active = false; };
    }, [session, authEpoch]);
    useEffect(() => {
        const reset = (event: Event) => {
            if (event instanceof StorageEvent && event.key !== null && event.key !== "barticket_token") return;
            // Capture every event synchronously. Comparing to rendered state loses
            // A→B→A events batched before a render; same-token auth still retires reads.
            const nextToken = getToken();
            authSerial.current++;
            serial.current++;
            store.reset(nextToken);
            setAuthState(current => ({ token: nextToken, epoch: current.epoch + 1 }));
            setRows([]); setKnownManagers([]); setViewer(null); setEditing(false); setDetail(false);
        };
        window.addEventListener("barticket-auth", reset); window.addEventListener("storage", reset);
        return () => { window.removeEventListener("barticket-auth", reset); window.removeEventListener("storage", reset); };
    }, [session, authEpoch]);
    useEffect(() => {
        if (detail && window.matchMedia("(max-width: 900px)").matches) { detailPanel.current?.scrollIntoView({ block: "nearest" }); detailPanel.current?.focus({ preventScroll: true }); }
    }, [detail, selected]);
    useEffect(() => {
        const retire = () => { serial.current++; };
        const initial = window.setTimeout(() => { setLoading(true); setRows([]); void load(); }, 0);
        const refresh = () => { setToday(businessDateJst(Date.now())); void load(); };
        const changed = () => { serial.current++; store.invalidate(); void load(true); };
        const interval = window.setInterval(refresh, 60000);
        window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
        document.addEventListener("visibilitychange", refresh); window.addEventListener("barticket-schedules-updated", changed);
        return () => { retire(); clearTimeout(initial); clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("barticket-schedules-updated", changed); };
    }, [load]);
    const format = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(ja ? "ja-JP" : "en-US", { ...options, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
    const navigate = (amount: number) => { const next = changeMonth(month, amount); setMonth(next); setSelected(`${next}-01`); setDetail(false); };
    const choose = (day: string) => { setSelected(day); setDetail(true); if (!day.startsWith(month)) setMonth(day.slice(0, 7)); };
    const selectedRow = rows.find(row => row.business_date === selected);
    const days = calendarDays(month);
    const names = (row: ScheduledShift) => [row.manager?.name, ...row.staff.map(person => person.name)].filter(Boolean).join(" · ");
    return <Page>
        <Toolbar>
            <div><h1>{t("Schedule", "シフト予定")}</h1><Subtitle>{t("Plans, not clock-in records", "勤務予定（打刻記録とは別）")}</Subtitle></div>
            <button className="secondary" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); setDetail(true); }}>{t("Today", "今日")}</button>
            <MonthNav><button className="secondary" aria-label={t("Previous month", "前月")} onClick={() => navigate(-1)}>‹</button><h2 aria-live="polite"><button className="secondary" aria-label={t("Show month calendar", "月間カレンダーを表示")} onClick={() => setMode("month")}>{format(`${month}-01`, { year: "numeric", month: "long" })}</button></h2><button className="secondary" aria-label={t("Next month", "翌月")} onClick={() => navigate(1)}>›</button></MonthNav>
            <Views aria-label={t("Calendar view", "表示方法")}><button className="secondary" aria-pressed={mode === "month"} onClick={() => setMode("month")}>{t("Month", "月")}</button><button className="secondary" aria-pressed={mode === "agenda"} onClick={() => setMode("agenda")}>{t("Agenda", "予定一覧")}</button></Views>
            {viewer?.role === "manager" ? <button onClick={() => { setSelected(selected.startsWith(month) ? selected : `${month}-01`); setCreating(true); setEditing(true); }}>{t("+ Create", "＋ 作成")}</button> : null}
        </Toolbar>
        {error ? <Notice role="alert">{t("Could not refresh schedules. Displayed plans may be out of date.", "予定を更新できませんでした。表示内容が古い場合があります。") } <span>{error}</span><button className="secondary" onClick={() => void load(true)}>{t("Retry", "再試行")}</button></Notice> : null}
        {loading ? <Subtitle role="status">{t("Loading schedules…", "予定を読み込んでいます…")}</Subtitle> : null}
        <Canvas>
            {mode === "month" ? <Calendar aria-label={t("Monthly schedule", "月間予定")}>
                {Array.from({ length: 7 }, (_, i) => <Weekday key={i}>{format(addDays("2026-11-01", i), { weekday: "short" })}</Weekday>)}
                {days.map(day => { const row = rows.find(item => item.business_date === day); return <Day key={day} $outside={!day.startsWith(month)} $selected={day === selected}>
                    <DayButton ref={node => { if (node) dateButtons.current.set(day, node); else dateButtons.current.delete(day); }} aria-label={format(day, { dateStyle: "full" })} aria-current={day === today ? "date" : undefined} aria-pressed={day === selected} onClick={() => choose(day)} onKeyDown={event => {
                        const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
                        if (delta) { event.preventDefault(); const next = addDays(day, delta); setSelected(next); dateButtons.current.get(next)?.focus(); }
                    }}><span>{Number(day.slice(-2))}</span></DayButton>
                    {row ? <EventBlock onClick={() => choose(day)} aria-label={`${day}: ${row.event_value ?? t("Shift plan", "勤務予定")}, ${names(row)}`}><strong>{row.event_value || t("Shift plan", "勤務予定")}</strong><span>{row.manager?.name || t("No manager", "担当未定")}</span><small>{row.staff.map(person => person.name).join(" · ") || t("No staff", "スタッフなし")}</small></EventBlock> : null}
                </Day>; })}
            </Calendar> : <Agenda aria-label={t("Scheduled shifts", "シフト予定一覧")}>
                {!loading && !rows.length ? <Empty>{t("No scheduled shifts this month.", "今月の予定はありません。")}</Empty> : rows.map(row => <AgendaRow key={row.id}>
                    <DateRail $today={row.business_date === today}><span>{format(row.business_date, { weekday: "short" })}</span><strong>{Number(row.business_date.slice(-2))}</strong></DateRail>
                    <AgendaEvent onClick={() => choose(row.business_date)}><small>{t("Date-only plan", "日付のみの予定")}</small><strong>{row.event_value || t("Shift plan", "勤務予定")}</strong><span>{t("Manager", "マネージャー")}: {row.manager?.name || t("Not assigned", "未定")}</span><span>{t("Staff", "スタッフ")}: {row.staff.map(person => person.name).join(" · ") || t("None", "なし")}</span></AgendaEvent>
                </AgendaRow>)}
            </Agenda>}
            {detail ? <Details ref={detailPanel} tabIndex={-1} aria-label={t("Selected day", "選択した日")}>
                <DetailHeader><h2>{format(selected, { month: "long", day: "numeric", weekday: "short" })}</h2><button className="secondary" onClick={() => setDetail(false)} aria-label={t("Close day details", "詳細を閉じる")}>×</button></DetailHeader>
                <h3>{selectedRow?.event_value || t("Shift plan", "勤務予定")}</h3>
                <Subtitle>{t("Date-only plan · hours not recorded", "日付のみの予定・勤務時間の記録なし")}</Subtitle>
                <dl><dt>{t("Manager", "マネージャー")}</dt><dd>{selectedRow?.manager?.name || t("Not assigned", "未定")}</dd><dt>{t("Staff", "スタッフ")}</dt><dd>{selectedRow?.staff.map(person => person.name).join(" · ") || t("None", "なし")}</dd></dl>
                {selectedRow?.actual_shift_exists ? <p>{t("An actual shift is also recorded. Editing this plan does not change it.", "実際のシフト記録があります。予定を変更しても実績は変わりません。")}</p> : null}
                {viewer?.role === "manager" ? <button onClick={() => { setCreating(!selectedRow); setEditing(true); }}>{selectedRow ? t("Edit plan", "予定を編集") : t("Add plan", "予定を追加")}</button> : null}
                {selectedRow?.provenance.length ? <details><summary>{t("Spreadsheet source", "勤務表の出典")}</summary>{selectedRow.provenance.map((source, i) => <p key={i}>{source.source_file} · {t("row", "行")} {source.source_row}<br />{source.imported_by}{source.uncertainty ? ` · ${source.uncertainty}` : ""}</p>)}</details> : null}
            </Details> : null}
        </Canvas>
        {editing && viewer?.role === "manager" ? <ScheduleEditor knownManagers={knownManagers} day={selected} row={creating ? undefined : selectedRow} ja={ja} onClose={() => setEditing(false)} onSaved={day => { setEditing(false); setSelected(day); setMonth(day.slice(0, 7)); setDetail(true); window.dispatchEvent(new Event("barticket-schedules-updated")); }} /> : null}
    </Page>;
}
const Page = styled.main`width: min(100% - 32px, 1440px); margin: 0 auto; padding: 16px 0 32px; button { width:auto; min-height:44px; } button:focus-visible { outline:3px solid var(--royal-300); outline-offset:2px; }`;
const Toolbar = styled.header`display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px;h1{font-size:21.6px;margin:0}h2{font-size:20px;margin:0} @media(max-width:600px){gap:8px; >div:first-child{flex:1} h1{font-size:19.2px}}`;
const Subtitle = styled.p`color:var(--neutral-300);font-size:13.6px;margin:4px 0;`;
const MonthNav = styled.div`display:flex;align-items:center;gap:6.4px;flex:1;button{font-size:25.6px;min-width:44px;padding:4px}h2{white-space:nowrap;flex:1;text-align:center;button{font-size:18.4px;}}@media(max-width:600px){order:4;flex-basis:100%;}`;
const Views = styled.div`display:flex;gap:4px;button[aria-pressed=true]{background:var(--neutral-600);color:var(--neutral-050);}`;
const Canvas = styled.div`display:flex;align-items:stretch;background:var(--neutral-900);border:1px solid var(--neutral-700);border-radius:16px;overflow:hidden;@media(max-width:900px){flex-direction:column;}`;
const Calendar = styled.div`display:grid;grid-template-columns:repeat(7,minmax(0,1fr));flex:1;min-width:0;`;
const Weekday = styled.div`padding:12.8px 3.2px;text-align:center;font-size:12.8px;color:var(--neutral-300);border-bottom:1px solid var(--neutral-700);`;
const Day = styled.div<{ $outside: boolean; $selected: boolean }>`min-width:0;min-height:135px;border-right:1px solid var(--neutral-700);border-bottom:1px solid var(--neutral-700);padding:4px;background:${p=>p.$selected?'var(--neutral-800)':p.$outside?'var(--neutral-950)':'transparent'};@media(max-width:600px){min-height:110px;padding:1.6px;}`;
const DayButton = styled.button`display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px!important;padding:0!important;margin:0 auto 3.2px;background:transparent!important;color:var(--neutral-100)!important;span{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;} &[aria-current=date] span{background:var(--royal-500);color:white;} &[aria-pressed=true] span{outline:1px solid var(--neutral-300);}@media(max-width:370px){min-width:36px;}`;
const EventBlock = styled.button`display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%!important;padding:6.4px 8px!important;border:0;border-left:3px solid #93c5fd;border-radius:5px;background:#253b54!important;color:#f0f6ff!important;text-align:left;font-size:12.8px;overflow:hidden;strong,span,small{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}small{font-size:12px;}@media(max-width:600px){padding:4.8px 3.2px!important;font-size:12px;small{font-size:12px;}}`;
const Agenda = styled.div`flex:1;min-width:0;padding:12px 16px;`;
const AgendaRow = styled.article`display:flex;gap:16px;padding:10.4px 0;`;
const DateRail = styled.div<{ $today: boolean }>`flex:0 0 42px;text-align:center;color:${p=>p.$today?'var(--royal-300)':'var(--neutral-300)'};span{display:block;font-size:12px;}strong{display:block;font-size:26.4px;line-height:1.5;}`;
const AgendaEvent = styled.button`overflow-wrap:anywhere;display:flex;flex:1;min-width:0;align-items:flex-start;flex-direction:column;gap:4px;padding:13.6px 16px!important;background:#253b54!important;color:#f0f6ff!important;border-left:3px solid #93c5fd;border-radius:8px;text-align:left;strong{font-size:16.8px;}small{color:#cbd5e1;}span{font-size:13.6px;overflow-wrap:anywhere;}`;
const Details = styled.aside`overflow-wrap:anywhere;width:320px;max-width:100%;flex-shrink:0;padding:20px;border-left:1px solid var(--neutral-700);h2{font-size:16.8px;}h3{margin:16px 0 4.8px;}dl{margin:16px 0;}dt{font-size:12.8px;color:var(--neutral-300);margin-top:16px;}dd{margin:3.2px 0;}p,details{font-size:12.8px;color:var(--neutral-300);overflow-wrap:anywhere;}details{margin-top:19.2px;}summary{cursor:pointer;min-height:44px;}@media(max-width:900px){width:auto;border-left:0;border-bottom:1px solid var(--neutral-700);order:-1;}`;
const DetailHeader = styled.div`display:flex;align-items:center;justify-content:space-between;gap:8px;`;
const Empty = styled.p`padding:32px;color:var(--neutral-300);text-align:center;`;
const Notice = styled.div`display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:16px;margin-bottom:16px;border:1px solid var(--danger-500);border-radius:8px;span{font-size:12.8px;}`;
