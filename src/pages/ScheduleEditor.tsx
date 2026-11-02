import { useEffect, useRef, useState, type FormEvent } from "react";
import styled from "styled-components";
import Select from "../components/Select";
import { accountApi, type Account } from "../api/account";
import { ApiError, getToken } from "../api/client";
import { scheduleEditorApi, type ScheduleDraft, type ScheduledShift, type ScheduledPerson } from "../api/scheduledShifts";

type Props = { knownManagers: ScheduledPerson[]; day: string; row?: ScheduledShift; ja: boolean; today: string; canWrite: boolean; onClose: () => void; onSaved: (day: string) => void };
type ScheduleType = "open" | "event" | "closed";
function planTypeFor(row?: ScheduledShift): ScheduleType {
    if (row?.schedule_type) return row.schedule_type;
    const legacy = row?.event_value?.trim().toLocaleLowerCase();
    if (legacy === "closed") return "closed";
    if (legacy === "open" || !legacy) return "open";
    return "event";
}
function planNotesFor(row?: ScheduledShift, type = planTypeFor(row)): string {
    return row?.event_notes ?? (type === "event" ? row?.event_value ?? "" : "");
}
export default function ScheduleEditor({ knownManagers, day, row: incomingRow, ja, today, canWrite, onClose, onSaved }: Props) {
    // Freeze both values and revision at open; background refresh must not authorize an old draft.
    const [row] = useState(incomingRow);
    const t = (en: string, jp: string) => ja ? jp : en;
    const dialog = useRef<HTMLDialogElement>(null);
    const token = useRef(getToken());
    const alive = useRef(true);
    const [date, setDate] = useState(day);
    const [scheduleType, setScheduleType] = useState<ScheduleType>(() => planTypeFor(row));
    // Keep notes mounted in state when the type changes, so toggling away from
    // Event and back does not erase a draft description.
    const [eventNotes, setEventNotes] = useState(() => planNotesFor(row));
    const [manager, setManager] = useState<ScheduledPerson | null>(row?.manager ?? null);
    const [staff, setStaff] = useState<ScheduledPerson[]>(row?.staff ?? []);
    const [users, setUsers] = useState<Account[]>([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [usersError, setUsersError] = useState(false);
    const dateIsPast = date < today;
    const sourceDateIsPast = !!row && row.business_date < today;
    const initialScheduleType = planTypeFor(row);
    const initialEventNotes = planNotesFor(row, initialScheduleType);
    const dirty = date !== day || scheduleType !== initialScheduleType || eventNotes !== initialEventNotes || JSON.stringify(manager) !== JSON.stringify(row?.manager ?? null) || JSON.stringify(staff) !== JSON.stringify(row?.staff ?? []);
    const close = () => { if (!busy && (!dirty || window.confirm(t("Discard your unsaved plan changes?", "保存していない変更を破棄しますか？")))) onClose(); };
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        alive.current = true; dialog.current?.showModal();
        void accountApi.listUsers().then(data => { if (alive.current && token.current === getToken()) setUsers(data); }).catch(() => { if (alive.current) setUsersError(true); });
        return () => { alive.current = false; previous?.focus(); };
    }, []);
    useEffect(() => {
        if (!dirty && !busy) return;
        const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        // BrowserRouter records a numeric history index. Capture before its bubble
        // listener so a cancelled Back/Forward never unmounts this draft.
        const originIndex: unknown = window.history.state?.idx;
        let restoring = false;
        const pop = (event: PopStateEvent) => {
            if (restoring) { restoring = false; event.stopImmediatePropagation(); return; }
            const targetIndex: unknown = event.state?.idx;
            if (typeof originIndex !== "number" || typeof targetIndex !== "number") return;
            if (busy || !window.confirm(ja ? "保存していない変更を破棄しますか？" : "Discard your unsaved plan changes?")) {
                event.stopImmediatePropagation(); restoring = true; window.history.go(originIndex - targetIndex);
            }
        };
        window.addEventListener("beforeunload", beforeUnload);
        window.addEventListener("popstate", pop, true);
        return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("popstate", pop, true); };
    }, [dirty, busy, ja]);
    const managerOptions: ScheduledPerson[] = users.filter(user => user.role === "manager").map(user => ({ name: user.name, user_id: user.id }));
    knownManagers.forEach(person => { if (!managerOptions.some(item => item.user_id === person.user_id && item.name === person.name)) managerOptions.push(person); });
    if (manager && !managerOptions.some(person => person.user_id === manager.user_id && person.name === manager.name)) managerOptions.unshift(manager);
    const staffOptions: ScheduledPerson[] = users.map(user => ({ name: user.name, user_id: user.id }));
    staff.forEach(person => { if (!staffOptions.some(item => item.user_id === person.user_id && item.name === person.name)) staffOptions.push(person); });
    const key = (person: ScheduledPerson) => `${person.user_id ?? "unlinked"}:${person.name}`;
    async function save(e: FormEvent) {
        e.preventDefault(); if (busy || token.current !== getToken()) return;
        setError("");
        if (!canWrite) { setError(t("Schedule date could not be verified. Editing is temporarily unavailable.", "予定日を確認できません。確認できるまで編集できません。")); return; }
        if (dateIsPast || sourceDateIsPast) { setError(t("Past schedule dates are read-only. Choose today or a future date.", "過去の予定は閲覧のみです。今日または未来の日付を選んでください。")); return; }
        const cleanNotes = scheduleType === "event" ? eventNotes.trim() || null : null;
        if (scheduleType === "event" && !cleanNotes) { setError(t("Add notes describing the event.", "イベントの内容を入力してください。")); return; }
        const compatibilityValue = scheduleType === "open" ? "Open" : scheduleType === "closed" ? "Closed" : cleanNotes;
        const body: ScheduleDraft = { business_date: date, schedule_type: scheduleType, event_notes: cleanNotes, event_value: compatibilityValue, manager, staff };
        if (!body.event_value && !manager && !staff.length) { setError(t("Add an event or an assigned person.", "イベントまたは担当者を追加してください。")); return; }
        if (row && !row.revision) { setError(t("Editing is not available yet. Refresh after the server update.", "編集機能は準備中です。サーバー更新後に再読み込みしてください。")); return; }
        setBusy(true);
        try {
            const saved = row ? await scheduleEditorApi.update(row.id, { ...body, expected_revision: row.revision! }) : await scheduleEditorApi.create(body);
            if (alive.current && token.current === getToken()) onSaved(saved.business_date);
        } catch (err) {
            if (!alive.current || token.current !== getToken()) return;
            setError(err instanceof ApiError && err.status === 409
                ? t("This date already has a plan, or someone changed it. Close and refresh before trying again; nothing was overwritten.", "同じ日に予定があるか、他の人が変更しました。閉じて更新し、確認してください。上書きしていません。")
                : t("Could not confirm the save. Close and refresh to check before retrying. ", "保存を確認できませんでした。閉じて更新し、確認してください。 ") + (err instanceof Error ? err.message : String(err)));
        } finally { if (alive.current) setBusy(false); }
    }
    return <Dialog ref={dialog} aria-labelledby="schedule-editor-title" onCancel={e => { if (busy) e.preventDefault(); else { e.preventDefault(); close(); } }}>
        <form onSubmit={save}>
            <Header><h2 id="schedule-editor-title">{row ? t("Edit plan", "予定を編集") : t("New plan", "予定を作成")}</h2><button type="button" className="secondary" disabled={busy} aria-label={t("Close editor", "編集を閉じる")} onClick={close}>×</button></Header>
            <p>{t("Date-only schedule. Attendance and pay stay unchanged.", "日付のみの予定です。出勤記録や給与は変更されません。")}</p>
            {!canWrite ? <ErrorBox role="status">{t("Schedule date could not be verified. Editing is temporarily unavailable.", "予定日を確認できません。確認できるまで編集できません。")}</ErrorBox> : null}
            <label htmlFor="schedule-type">{t("Schedule type", "予定の種類")}</label>
            <Select id="schedule-type" disabled={!canWrite || busy} value={scheduleType} onChange={e => setScheduleType(e.target.value as ScheduleType)}>
                <option value="open">{t("Open", "営業")}</option>
                <option value="event">{t("Event", "イベント")}</option>
                <option value="closed">{t("Closed", "休業")}</option>
            </Select>
            {scheduleType === "event" ? <label htmlFor="schedule-event-notes">{t("Event notes", "イベントのメモ")}<textarea id="schedule-event-notes" disabled={!canWrite || busy} maxLength={1000} required value={eventNotes} onChange={e => setEventNotes(e.target.value)} placeholder={t("Describe the event", "イベントの内容を入力")} /></label> : null}
            <label>{t("Business date", "営業日")}<input disabled={!canWrite || busy} type="date" min={today} required value={date} onChange={e => setDate(e.target.value)} /></label>
            {dateIsPast || sourceDateIsPast ? <ErrorBox role="status">{t("Past schedule dates are read-only. Choose today or a future date.", "過去の予定は閲覧のみです。今日または未来の日付を選んでください。")}</ErrorBox> : null}
            <label htmlFor="schedule-manager">{t("Manager", "マネージャー")}</label><Select id="schedule-manager" disabled={!canWrite || busy} value={manager ? key(manager) : ""} onChange={e => { const person = managerOptions.find(person => key(person) === e.target.value) ?? null; setManager(person); if (person) setStaff(current => current.filter(item => key(item) !== key(person))); }}><option value="">{t("Not assigned", "未定")}</option>{managerOptions.map(person => <option key={key(person)} value={key(person)}>{person.name}</option>)}</Select>
            {usersError ? <p role="alert">{t("Account choices could not load. Existing assignments are preserved.", "アカウントを読み込めませんでした。現在の担当者は保持されます。")}</p> : null}
            <fieldset disabled={!canWrite || busy}><legend>{t("Staff", "スタッフ")}</legend>{staffOptions.filter(person => !manager || key(person) !== key(manager)).map(person => <Choice key={key(person)}><input type="checkbox" checked={staff.some(item => key(item) === key(person))} onChange={e => setStaff(current => e.target.checked ? [...current, person] : current.filter(item => key(item) !== key(person)))} />{person.name}</Choice>)}{!staff.length ? <small>{t("No staff assigned", "スタッフなし")}</small> : null}</fieldset>
            {error ? <ErrorBox role="alert">{error}</ErrorBox> : null}
            <Footer><button type="button" className="secondary" disabled={busy} onClick={close}>{t("Cancel", "キャンセル")}</button><button type="submit" disabled={!canWrite || busy || dateIsPast || sourceDateIsPast || (!!row && !row.revision)}>{busy ? t("Saving…", "保存中…") : t("Save plan", "予定を保存")}</button></Footer>
        </form>
    </Dialog>;
}
const Dialog = styled.dialog`margin:auto;width:min(500px,calc(100% - 32px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid var(--neutral-600);border-radius:18px;padding:22.4px;background:var(--neutral-900);color:var(--neutral-100);box-shadow:0 20px 80px #0008;::backdrop{background:#0009;}form{display:flex;flex-direction:column;gap:12.8px;}h2{font-size:19.2px;margin:0;}p,small{font-size:12.8px;color:var(--neutral-300);margin:0;}label{display:flex;flex-direction:column;gap:6.4px;font-size:14.4px;}input:not([type=checkbox]),textarea{width:100%;min-height:44px;}textarea{min-height:104px;resize:vertical;}button{min-height:44px;width:auto;}fieldset{border:0;border-top:1px solid var(--neutral-700);padding:12.8px 0;display:flex;flex-direction:column;gap:3.2px;}@media(max-width:600px){width:100%;max-width:none;height:100dvh;max-height:none;margin:0;border-radius:0;padding:19.2px;} `;
const Header = styled.div`display:flex;align-items:center;justify-content:space-between;`;
const Footer = styled.div`display:flex;justify-content:flex-end;gap:8px;padding-top:8px;`;
const Choice = styled.label`flex-direction:row!important;align-items:center;min-height:44px;input{width:20px;height:20px;margin-right:8px;}`;
const ErrorBox = styled.div`padding:12px;border:1px solid var(--danger-500);border-radius:8px;font-size:13.6px;`;
