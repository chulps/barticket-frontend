import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styled from "styled-components";
import type { Account, ShiftReport } from "../api/account";
import { historicalHoursApi, type HistoricalHoursPreview, type HistoricalHoursSourceRow } from "../api/historicalHours";
import { buildHistoricalHoursBatch } from "./historicalHoursCsv";
import { importPreview, parseCsv, type CsvData } from "./reconciliationCsv";
import { canDiscard, defaultCsvMapping } from "./reconciliationDraftSafety";

type Field = "manager" | "revenue" | "guests" | "event";
type MobileRecordField = { label: string; value: ReactNode };

function MobileRecord({ title, fields }: { title: string; fields: MobileRecordField[] }) {
    return <RecordCard>
        <h5>{title}</h5>
        <dl>{fields.map((field, index) => <div key={`${field.label}-${index}`}>
            <dt>{field.label}</dt><dd>{field.value}</dd>
        </div>)}</dl>
    </RecordCard>;
}

type Draft = { manager: string; revenue: string; guests: string; event: string; notes: string; staff: string; guestName: string; guestPayType: string; guestPayAmount: string; guestDrinkback: string; staffHours: Record<string, string> };
const fresh = (shift: ShiftReport): Draft => ({
    manager: shift.opened_by ?? "", revenue: String(shift.paid_total), guests: String(shift.guest_count),
    event: "", notes: "", staff: "none", guestName: "", guestPayType: "", guestPayAmount: "", guestDrinkback: "", staffHours: Object.fromEntries(shift.staff_hours.map(row => [row.name, String(row.seconds / 3600)]))
});
const validNumber = (value: string) => value.trim() !== "" && /^\d+$/.test(value.trim());

// Per-tab working copy: protects browser-back/forward and internal route changes.
// Never sent to a server or written to localStorage/sessionStorage.
type WorkingCopy = { selectedId: number | null; draft: Draft | null; csv: CsvData | null; mapping: Record<string, string> };
let temporaryWorkingCopy: WorkingCopy | null = null;
const labels = (ja: boolean) => ({
    date: ja ? "日付" : "Date", manager: ja ? "マネージャー" : "Manager",
    revenue: ja ? "売上 (円)" : "Revenue (JPY)", guests: ja ? "来客数" : "Guests",
    event: ja ? "営業区分" : "Shift type", notes: ja ? "修正理由・メモ" : "Correction notes",
    hours: ja ? "勤務時間（合計）" : "Total hours worked"
});

export default function Reconciliation({ shifts, users, locale, error, initialShiftId }: { shifts: ShiftReport[]; users: Account[]; locale: string; error: string; initialShiftId?: number | null }) {
    const ja = locale === "ja", text = labels(ja);
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<number | null>(() => temporaryWorkingCopy?.selectedId ?? initialShiftId ?? null);
    const [draft, setDraft] = useState<Draft | null>(() => {
        if (temporaryWorkingCopy) return temporaryWorkingCopy.draft;
        const shift = shifts.find(row => row.id === initialShiftId);
        return shift ? fresh(shift) : null;
    });
    const [csv, setCsv] = useState<CsvData | null>(() => temporaryWorkingCopy?.csv ?? null);
    const [csvFileName, setCsvFileName] = useState("");
    const [csvError, setCsvError] = useState("");
    const [historyError, setHistoryError] = useState("");
    const [historyPreview, setHistoryPreview] = useState<HistoricalHoursPreview | null>(null);
    const [historyBatch, setHistoryBatch] = useState<{ sourceFile: string; rows: HistoricalHoursSourceRow[] } | null>(null);
    const [selectedHistoryCells, setSelectedHistoryCells] = useState<string[]>([]);
    const [historyCorrectionReason, setHistoryCorrectionReason] = useState("");
    const [historyBusy, setHistoryBusy] = useState(false);
    const [previewFilter, setPreviewFilter] = useState<"all" | "new" | "conflict" | "match">("all");
    const [reportNotice, setReportNotice] = useState("");
    const [mapping, setMapping] = useState<Record<string, string>>(() => temporaryWorkingCopy?.mapping ?? {});
    const [extraHourKey, setExtraHourKey] = useState("");
    const [restoredFromMemory] = useState(() => temporaryWorkingCopy !== null);
    const csvRequestVersion = useRef(0);
    const selected = shifts.find(shift => shift.id === selectedId) ?? null;
    const filtered = useMemo(() => shifts.filter(shift => [shift.business_date, shift.opened_by].join(" ").toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.business_date.localeCompare(a.business_date)), [shifts, search]);
    const invalidDraft = Boolean(draft && (!["Chuck", "Nori"].includes(draft.manager) || (draft.staff === "guest" && (!draft.guestName.trim() || (draft.guestPayType !== "" && !["hourly", "flat", "revenue", "custom"].includes(draft.guestPayType)) || (draft.guestPayAmount !== "" && (!validNumber(draft.guestPayAmount) || (draft.guestPayType === "revenue" && Number(draft.guestPayAmount) > 100))) || (draft.guestDrinkback !== "" && (!validNumber(draft.guestDrinkback) || Number(draft.guestDrinkback) > 100)))) || !validNumber(draft.revenue) || !validNumber(draft.guests) ||
        Object.values(draft.staffHours).some(value => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 24))));
    const changed = Boolean(draft && selected && (draft.manager !== selected.opened_by || draft.revenue !== String(selected.paid_total) ||
        draft.guests !== String(selected.guest_count) || draft.event || draft.notes || draft.staff !== "none" || draft.guestName || draft.guestPayType || draft.guestPayAmount || draft.guestDrinkback ||
        Object.entries(draft.staffHours).some(([name, value]) => value !== String((selected.staff_hours.find(row => row.name === name)?.seconds ?? 0) / 3600))));
    const preview = useMemo(() => csv ? importPreview(csv, mapping, shifts) : null, [csv, mapping, shifts]);
    const hasUnsavedWork = changed || csv !== null;
    const previewRows = useMemo(() => (preview?.preview ?? []).filter(row =>
        previewFilter === "all" || row.state === previewFilter
    ), [preview, previewFilter]);
    async function copyComparisonReport() {
        if (!preview || preview.errors.length) return;
        const comparison = {
            mode: "READ_ONLY_COMPARISON_NOT_IMPORTED",
            generated_at: new Date().toISOString(),
            total_rows: preview.preview.length,
            new_rows: preview.preview.filter(row => row.state === "new").length,
            conflicts: preview.preview.filter(row => row.state === "conflict").length,
            matches: preview.preview.filter(row => row.state === "match").length,
            rows: preview.preview.map(({ imported, state, differences, existing }) => ({
                business_date: imported.date,
                source_line: imported.line,
                outcome: state,
                differing_fields: differences,
                imported: { manager: imported.manager, revenue: imported.revenue, guests: imported.guests, staff_hours_total: imported.staffHours },
                existing: existing ? { shift_id: existing.id, manager: existing.opened_by, revenue: existing.paid_total, guests: existing.guest_count } : null,
            })),
        };
        try {
            await navigator.clipboard.writeText(JSON.stringify(comparison, null, 2));
            setReportNotice(ja ? "比較レポートをコピーしました。DBのレコードは変更されていません。" : "Comparison report copied. No database records were changed.");
        } catch {
            setReportNotice(ja ? "コピーできませんでした。クリップボード権限を確認してください。" : "Could not copy. Check your clipboard permissions.");
        }
    }

    useEffect(() => {
        // Keep a short-lived in-memory restore point when navigating away.
        temporaryWorkingCopy = hasUnsavedWork ? { selectedId, draft, csv, mapping } : null;
    }, [selectedId, draft, csv, mapping, hasUnsavedWork]);

    useEffect(() => {
        const clearOnAuthChange = () => {
            temporaryWorkingCopy = null;
            setHistoryPreview(null);
            setHistoryBatch(null);
            setSelectedHistoryCells([]);
            setHistoryCorrectionReason("");
            setHistoryError("");
        };
        window.addEventListener("barticket-auth", clearOnAuthChange);
        return () => window.removeEventListener("barticket-auth", clearOnAuthChange);
    }, []);

    useEffect(() => {
        if (!hasUnsavedWork) return;
        const message = ja
            ? "未保存の照合作業があります。この画面を離れますか？（データベースには保存されていません）"
            : "You have unsaved reconciliation work. Leave this view? Nothing is saved to the database.";
        const beforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        const interceptNavigation = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (!(event.target instanceof Element)) return;
            const anchor = event.target.closest("a[href]");
            if (!anchor || anchor.getAttribute("target") === "_blank") return;
            const destination = new URL(anchor.getAttribute("href") ?? "", window.location.href);
            if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
            if (!window.confirm(message)) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        window.addEventListener("beforeunload", beforeUnload);
        document.addEventListener("click", interceptNavigation, true);
        return () => {
            window.removeEventListener("beforeunload", beforeUnload);
            document.removeEventListener("click", interceptNavigation, true);
        };
    }, [hasUnsavedWork, ja]);

    const confirmDiscard = (dirty: boolean) => canDiscard(dirty, () => window.confirm(ja
        ? "未保存の変更を破棄しますか？ データベースには保存されていません。"
        : "Discard unsaved reconciliation changes? Nothing was saved to the database."));
    const update = (field: Field | "notes", value: string) => setDraft(previous => previous ? { ...previous, [field]: value } : previous);
    const open = (shift: ShiftReport) => {
        if (selectedId === shift.id) return;
        if (!confirmDiscard(changed)) return;
        setSelectedId(shift.id);
        setDraft(fresh(shift));
    };
    const mapField = (key: string, header: string) => setMapping(previous => ({ ...previous, [key]: header }));
    const historyCellKey = (sourceRow: number, sourceColumn: string) => `${sourceRow}\u0000${sourceColumn}`;
    const mapOption = (key: string, name: string) => <label key={key}>{name}
        <SelectBox><select value={mapping[key] ?? ""} onChange={event => mapField(key, event.target.value)}>
            <option value="">{ja ? "選択なし" : "Not mapped"}</option>
            {csv?.headers.map(header => <option key={header} value={header}>{header}</option>)}
        </select><Caret aria-hidden="true">▾</Caret></SelectBox>
    </label>;

    async function readCsv(file?: File) {
        if (!file || !confirmDiscard(csv !== null)) return;
        if (file.size > 2_000_000) {
            setCsvError(ja ? "2 MB以下のCSVを選択してください。" : "Choose a CSV under 2 MB.");
            return;
        }
        const request = ++csvRequestVersion.current;
        try {
            const parsed = parseCsv(await file.text());
            if (request !== csvRequestVersion.current) return;
            // Commit a complete replacement only after a successful read/parse.
            // Invalid/malformed files leave the old preview and mappings intact.
            setCsv(parsed);
            setCsvFileName(file.name);
            setPreviewFilter("all");
            setReportNotice("");
            setHistoryPreview(null);
            setHistoryBatch(null);
            setSelectedHistoryCells([]);
            setHistoryError("");
            setMapping(defaultCsvMapping(parsed.headers));
            setCsvError("");
        } catch (e) {
            if (request === csvRequestVersion.current) setCsvError(e instanceof Error ? e.message : String(e));
        }
    }

    async function reconcileHistory() {
        if (!csv || historyBusy) return;
        setHistoryBusy(true);
        setHistoryError("");
        setHistoryPreview(null);
        setHistoryBatch(null);
        setSelectedHistoryCells([]);
        setHistoryCorrectionReason("");
        try {
            const batch = buildHistoricalHoursBatch(csv, mapping, users, csvFileName);
            const result = await historicalHoursApi.reconcile(batch.sourceFile, batch.rows);
            setHistoryBatch(batch);
            setHistoryPreview(result);
        } catch (e) {
            setHistoryError(e instanceof Error ? e.message : String(e));
        } finally {
            setHistoryBusy(false);
        }
    }

    async function importHistory() {
        if (!historyBatch || !historyPreview || !selectedHistoryCells.length || historyBusy) return;
        const selected = new Set(selectedHistoryCells);
        const selectedRows = historyPreview.rows.filter(row =>
            (row.state === "new" || row.state === "conflict") && row.user_id !== null && selected.has(historyCellKey(row.source_row, row.source_column))
        );
        const hasConflicts = selectedRows.some(row => row.state === "conflict");
        if (hasConflicts && !historyCorrectionReason.trim()) {
            setHistoryError(ja ? "差異を修正する理由を入力してください。" : "Enter a reason for correcting the conflicting totals.");
            return;
        }
        const approved = selectedRows.map(row => ({
            source_row: row.source_row,
            source_column: row.source_column,
            ...(row.state === "conflict" ? { correction_reason: historyCorrectionReason.trim() } : {}),
        }));
        if (!approved.length) return;
        const hoursTotal = historyPreview.rows
            .filter(row => approved.some(cell => cell.source_row === row.source_row && cell.source_column === row.source_column))
            .reduce((sum, row) => sum + row.source_seconds / 3600, 0);
        const confirmText = ja
            ? `${approved.length}件、合計${hoursTotal}時間を履歴として取り込みます。打刻時刻は作成しません。続けますか？`
            : `Save ${approved.length} spreadsheet hour entries (${hoursTotal} total hours), including ${selectedRows.filter(row => row.state === "conflict").length} audited corrections? Existing clock times will remain unchanged.`;
        if (!window.confirm(confirmText)) return;
        setHistoryBusy(true);
        setHistoryError("");
        try {
            await historicalHoursApi.import(historyBatch.sourceFile, historyBatch.rows, approved);
            const refreshed = await historicalHoursApi.reconcile(historyBatch.sourceFile, historyBatch.rows);
            setHistoryPreview(refreshed);
            setSelectedHistoryCells([]);
            setHistoryCorrectionReason("");
        } catch (e) {
            setHistoryError(e instanceof Error ? e.message : String(e));
        } finally {
            setHistoryBusy(false);
        }
    }

    function copyDraft() {
        if (!draft || !selected || invalidDraft) return;
        const summary = JSON.stringify({ source: "manual draft — NOT SAVED", shift_id: selected.id, business_date: selected.business_date,
            original: { manager: selected.opened_by, revenue: selected.paid_total, guests: selected.guest_count },
            proposed: draft }, null, 2);
        void navigator.clipboard?.writeText(summary);
    }

    return <Wrap>
        <h2>{ja ? "過去の勤務時間" : "Historical staff hours"}</h2>
        <Notice role="status"><strong>{ja ? "保存するのは選択した勤務時間だけです" : "Only selected staff hours are saved"}</strong>
            {restoredFromMemory ? <p>{ja ? "このタブの一時メモリから未保存の下書きを復元しました。再読み込みすると消えます。" : "Restored a temporary working copy from this tab's memory. Refreshing the page may erase it."}</p> : null}
            <p>{ja ? "照合は読み取り専用です。保存すると、選択したスタッフの合計時間だけが記録されます。マネージャー・売上・来客数・イベントは変更されません。" :
                "Reconciliation is read-only. Saving records only selected staff-hour totals. Manager, revenue, guest count, and event values are not changed."}</p>
        </Notice>
        {error ? <p role="alert">{error}</p> : null}
        <Block>
            <details>
                <summary>{ja ? "記録済みシフトを確認・編集案を作成（保存不可）" : "Recorded shifts — view or prepare a draft (saving unavailable)"}</summary>
            <h3>{ja ? "既存シフトを編集（下書き）" : "Edit recorded shifts (draft)"}</h3>
            <p>{ja ? "APIで取得できたシフトのみ表示します。未移行の月は表示されません。" : "Only shifts currently returned by the API appear here. Unmigrated months will not appear."}</p>
            <label>{ja ? "日付・マネージャーを検索" : "Search date or manager"}
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="2026-09 / Chuck / Nori" />
            </label>
            <TableWrap><table><thead><tr><th>{text.date}</th><th>{text.manager}</th><th>{text.revenue}</th><th>{text.guests}</th><th /></tr></thead>
                <tbody>{filtered.map(shift => <tr key={shift.id}><td>{shift.business_date}</td><td>{shift.opened_by || "—"}</td>
                    <td>¥{shift.paid_total.toLocaleString()}</td><td>{shift.guest_count}</td><td><button type="button" className="small secondary" onClick={() => open(shift)}>{ja ? "編集" : "Edit draft"}</button></td></tr>)}</tbody></table></TableWrap>
            {!filtered.length ? <p>{ja ? "一致するシフトがありません。" : "No matching shifts were returned."}</p> : null}
            {selected && draft ? <Editor>
                <h3>{selected.business_date} — {ja ? "修正案" : "Proposed changes"}</h3>
                <p>{ja ? "元の値: " : "Original: "}{selected.opened_by} · ¥{selected.paid_total.toLocaleString()} · {selected.guest_count} {ja ? "名" : "guests"}</p>
                <Fields>
                    <fieldset>
                        <legend>{text.manager}</legend>
                        <RadioRow>{(["Chuck", "Nori"] as const).map(name => <label key={name}>
                            <input type="radio" name="reconciliation-manager" checked={draft.manager === name}
                                onChange={() => update("manager", name)} />{name}
                        </label>)}</RadioRow>
                    </fieldset>
                    {(["revenue", "guests"] as const).map(key => <label key={key}>{text[key]}
                        <input type="number" min="0" step="1" value={draft[key]} onChange={e => update(key, e.target.value)} />
                    </label>)}
                    <label>{ja ? "スタッフ" : "Staff"}
                        <SelectBox><select value={draft.staff} onChange={e => setDraft(current => current ? { ...current, staff: e.target.value, guestName: "", guestPayType: "", guestPayAmount: "", guestDrinkback: "" } : current)}>
                            <option value="none">{ja ? "なし" : "None"}</option>
                            <option value="Kanata">{ja ? "カナタ" : "Kanata"}</option>
                            <option value="Haruka">{ja ? "ハルカ" : "Haruka"}</option>
                            <option value="guest">{ja ? "ゲスト・その他" : "Guest / Other"}</option>
                        </select><Caret aria-hidden="true">▾</Caret></SelectBox>
                    </label>
                    {draft.staff === "guest" ? <>
                        <label>{ja ? "ゲスト名" : "Guest bartender"}
                            <SelectBox><select value={["Yuchan", "Mii-chan"].includes(draft.guestName) ? draft.guestName : "other"}
                                onChange={e => setDraft(current => current ? { ...current, guestName: e.target.value === "other" ? "" : e.target.value } : current)}>
                                <option value="other">{ja ? "その他・新規" : "Other / new guest"}</option>
                                <option value="Yuchan">Yuchan</option>
                                <option value="Mii-chan">Mii-chan</option>
                            </select><Caret aria-hidden="true">▾</Caret></SelectBox>
                        </label>
                        <label>{ja ? "名前（確認・編集）" : "Guest name (confirm / edit)"}
                            <input value={draft.guestName} placeholder={ja ? "ゲストの名前" : "Enter guest name"}
                                onChange={e => setDraft(current => current ? { ...current, guestName: e.target.value } : current)} />
                        </label>
                        <label>{ja ? "契約タイプ（シフトごと）" : "Agreement type (this shift only)"}
                            <SelectBox><select value={draft.guestPayType} onChange={e => setDraft(current => current ? { ...current, guestPayType: e.target.value, guestPayAmount: "" } : current)}>
                                <option value="">{ja ? "未設定・不明" : "Not specified / unknown"}</option>
                                <option value="hourly">{ja ? "時給" : "Hourly"}</option>
                                <option value="flat">{ja ? "固定報酬" : "Flat fee"}</option>
                                <option value="revenue">{ja ? "売上歩合" : "Revenue percentage"}</option>
                                <option value="custom">{ja ? "その他" : "Custom"}</option>
                            </select><Caret aria-hidden="true">▾</Caret></SelectBox>
                        </label>
                        {draft.guestPayType && draft.guestPayType !== "custom" ? <label>{draft.guestPayType === "revenue" ? (ja ? "売上歩合 (%)" : "Revenue share (%)") : (ja ? "契約金額 (円)" : "Agreed amount (JPY)")}
                            <input type="number" min="0" max={draft.guestPayType === "revenue" ? 100 : undefined} step="any" value={draft.guestPayAmount}
                                onChange={e => setDraft(current => current ? { ...current, guestPayAmount: e.target.value } : current)} />
                        </label> : null}
                        <label>{ja ? "スタッフドリンクバック (%)" : "Staff drinkback (%) — if agreed"}
                            <input type="number" min="0" max="100" step="any" value={draft.guestDrinkback} placeholder={ja ? "未設定" : "Not specified"}
                                onChange={e => setDraft(current => current ? { ...current, guestDrinkback: e.target.value } : current)} />
                        </label>
                        <p>{ja ? "ゲストの契約条件はシフトごとに異なります。未入力は不明として扱い、給与を推測しません。すべて未保存です。" : "Guest contracts vary by appearance. Blank means unknown, not zero. No guest pay is assumed or saved."}</p>
                    </> : null}
                    <label>{text.event}
                        <SelectBox><select value={draft.event} onChange={e => update("event", e.target.value)}>
                            <option value="">{ja ? "未設定" : "Not recorded"}</option>
                            <option value="open">{ja ? "営業" : "Open"}</option>
                            <option value="closed">{ja ? "休業" : "Closed"}</option>
                            <option value="event">{ja ? "イベント" : "Event"}</option>
                        </select><Caret aria-hidden="true">▾</Caret></SelectBox>
                    </label>
                    <label>{text.notes}<input value={draft.notes} onChange={e => update("notes", e.target.value)} /></label>
                </Fields>
                <h3>{text.hours}</h3>
                <p>{ja ? "時間は合計で記録します。出勤・退勤の時刻は作成しません。" : "Record total hours only. Do not fabricate clock-in/out timestamps."}</p>
                {Object.entries(draft.staffHours).map(([name, value]) => <label key={name}>{name} <input type="number" min="0" max="24" step="0.25" value={value}
                    onChange={e => setDraft(current => current ? { ...current, staffHours: { ...current.staffHours, [name]: e.target.value } } : current)} /></label>)}
                <label>{ja ? "勤務時間を追加するスタッフ" : "Add staff hours for"}
                    <SelectBox><select value={extraHourKey} onChange={e => setExtraHourKey(e.target.value)}>
                        <option value="">{ja ? "選択してください" : "Select staff"}</option>
                        {["Kanata", "Haruka", "Yuchan", "Mii-chan", ...(draft.guestName.trim() ? [draft.guestName.trim()] : [])].filter(name => !Object.hasOwn(draft.staffHours, name)).map(name => <option key={name} value={name}>{name}</option>)}
                    </select><Caret aria-hidden="true">▾</Caret></SelectBox>
                </label>
                <button type="button" className="small secondary" disabled={!extraHourKey} onClick={() => { if (!Object.hasOwn(draft.staffHours, extraHourKey)) setDraft({ ...draft, staffHours: { ...draft.staffHours, [extraHourKey]: "" } }); setExtraHourKey(""); }}>{ja ? "追加" : "Add staff"}</button>
                {invalidDraft ? <p role="alert">{ja ? "担当者・売上・来客数・勤務時間を確認してください。" : "Check manager, revenue, guests and hours for invalid values."}</p> : null}
                <p>{changed ? (ja ? "変更あり（未保存）" : "Unsaved changes") : (ja ? "変更なし" : "No changes")}</p>
                <Actions><button type="button" className="secondary" disabled={!changed || invalidDraft} onClick={copyDraft}>{ja ? "修正案をコピー" : "Copy draft JSON"}</button>
                    <button type="button" disabled title={ja ? "バックエンド対応待ち" : "Awaiting backend API"}>{ja ? "保存（未対応）" : "Save — unavailable"}</button>
                    <button type="button" className="hollow secondary" onClick={() => { if (confirmDiscard(changed)) setDraft(fresh(selected)); }}>{ja ? "リセット" : "Reset draft"}</button>
                    <button type="button" className="hollow secondary" onClick={() => { if (confirmDiscard(changed)) { setSelectedId(null); setDraft(null); } }}>{ja ? "閉じる" : "Close"}</button></Actions>
            </Editor> : null}
            </details>
        </Block>
        <Block>
            <StepHeading><span>1</span><h3>{ja ? "勤務表CSVを選ぶ" : "Choose the staff-hours CSV"}</h3></StepHeading>
            <p>{ja ? "1. CSVを選び、日付・スタッフ名・合計時間の列を確認します。2. 勤務時間を照合して結果を確認します。照合だけでは保存されません。" : "1. Choose the CSV and check the date, staff-name, and total-hours columns. 2. Reconcile staff hours to preview the results. This step does not save anything."}</p>
            <label>CSV (.csv, UTF-8)<input type="file" accept=".csv,text/csv" onChange={e => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                void readCsv(file);
            }} /></label>
            {csvError ? <p role="alert">{csvError}</p> : null}
            {csv ? <>
                <p>{csv.rows.length} {ja ? "行" : "rows"} · {csv.headers.length} {ja ? "列" : "columns"}</p>
                <fieldset>
                    <legend>{ja ? "2. 勤務時間の列を対応付ける" : "2. Map the staff-hours columns"}</legend>
                    <p>{ja ? "日付、スタッフ名、合計時間を選びます。時間が空の行は取り込み対象外です。" : "Choose the date, staff name, and total-hours columns. Rows with blank hours are skipped."}</p>
                    <Fields>{(["date", "staff", "hours"] as const).map(key => mapOption(key, key === "staff" ? (ja ? "スタッフ名" : "Staff name") : key === "hours" ? text.hours : text.date))}</Fields>
                </fieldset>
                <fieldset>
                    <legend>{ja ? "任意：営業日レポートを比較（読み取り専用）" : "Optional: compare daily reports (read-only)"}</legend>
                    <p>{ja ? "この比較は勤務時間の取り込みとは別です。マネージャー、売上、来客数、イベントの照合だけを行い、保存しません。" : "This is separate from staff-hours import. It compares manager, revenue, guests, and event values only; nothing is saved."}</p>
                    <Fields>{(["manager", "revenue", "guests", "event"] as const).map(key => mapOption(key, text[key]))}</Fields>
                </fieldset>
                {preview?.errors.length ? <Notice role="alert">{preview.errors.slice(0, 20).map(message => <p key={message}>{message}</p>)}{preview.errors.length > 20 ? <p>+ {preview.errors.length - 20}</p> : null}</Notice> : null}
                {preview && !preview.errors.length ? <details>
                    <summary>{ja ? "営業日レポート比較を表示（読み取り専用）" : "Show daily report comparison (read-only)"}</summary>
                    <p>{ja ? "各マネージャー欄はそれぞれの記録元の値です。不一致は記録間の差であり、同じ日に二人のマネージャーがいたことを意味しません。" : "Each manager column shows the value recorded by that source. A mismatch means the records disagree; it does not indicate two managers were assigned to that day."}</p>
                    <p>{ja ? "新規" : "New"}: {preview.preview.filter(row => row.state === "new").length} · {ja ? "差異あり" : "Conflicts"}: {preview.preview.filter(row => row.state === "conflict").length} · {ja ? "一致" : "Matches"}: {preview.preview.filter(row => row.state === "match").length}</p>
                    <Actions role="group" aria-label={ja ? "比較結果フィルター" : "Comparison result filters"}>
                        {(["all", "conflict", "new", "match"] as const).map(key => (
                            <button key={key} type="button" className={previewFilter === key ? "secondary" : "hollow secondary"}
                                aria-pressed={previewFilter === key} onClick={() => setPreviewFilter(key)}>
                                {key === "all" ? (ja ? "すべて" : "All")
                                    : key === "conflict" ? (ja ? "差異のみ" : "Conflicts")
                                        : key === "new" ? (ja ? "新規のみ" : "New only")
                                            : (ja ? "一致のみ" : "Matches")}
                            </button>
                        ))}
                    </Actions>
                    <p className="shift-muted" role="status">{ja ? "表示中" : "Showing"}: {previewRows.length} / {preview.preview.length}</p>
                    <DesktopRows><TableWrap><table><thead><tr>
                        <th>{text.date}</th>
                        <th>{ja ? "マネージャー（勤務表）" : "Manager (spreadsheet)"}</th>
                        <th>{ja ? "マネージャー（BarTicket）" : "Manager (BarTicket)"}</th>
                        <th>{ja ? "イベント（勤務表）" : "Event (spreadsheet)"}</th>
                        <th>{ja ? "売上（勤務表 / BarTicket）" : "Revenue (spreadsheet / BarTicket)"}</th>
                        <th>{ja ? "来客数（勤務表 / BarTicket）" : "Guests (spreadsheet / BarTicket)"}</th>
                        <th>{ja ? "差異" : "Differences"}</th>
                    </tr></thead>
                        <tbody>{previewRows.map(({ imported, existing, state, differences }) => {
                            const details = differences.map(field => field === "manager"
                                ? `${ja ? "マネージャーの記録が不一致" : "Manager records differ"}: ${ja ? "勤務表" : "Spreadsheet"} ${imported.manager} · BarTicket ${existing?.opened_by ?? "—"}`
                                : field === "revenue"
                                    ? `${text.revenue}: ¥${imported.revenue.toLocaleString()} · BarTicket ¥${(existing?.paid_total ?? 0).toLocaleString()}`
                                    : `${text.guests}: ${imported.guests} · BarTicket ${existing?.guest_count ?? "—"}`);
                            return <tr key={imported.line}>
                                <td>{imported.date}</td><td>{imported.manager}</td><td>{existing?.opened_by ?? "—"}</td>
                                <td>{imported.event || "—"}</td>
                                <td>¥{imported.revenue.toLocaleString()} / {existing ? `¥${existing.paid_total.toLocaleString()}` : "—"}</td>
                                <td>{imported.guests} / {existing?.guest_count ?? "—"}</td>
                                <td>{state === "new" ? (ja ? "記録なし" : "No recorded shift")
                                    : state === "match" ? (ja ? "一致" : "Match")
                                        : details.join("; ")}</td>
                            </tr>;
                        })}</tbody></table></TableWrap></DesktopRows>
                    <MobileRows role="list" aria-label={ja ? "営業日比較" : "Daily report comparison"}>
                        {previewRows.map(({ imported, existing, state, differences }) => {
                            const details = differences.map(field => field === "manager"
                                ? `${ja ? "マネージャーの記録が不一致" : "Manager records differ"}: ${ja ? "勤務表" : "Spreadsheet"} ${imported.manager} · BarTicket ${existing?.opened_by ?? "—"}`
                                : field === "revenue"
                                    ? `${text.revenue}: ¥${imported.revenue.toLocaleString()} · BarTicket ¥${(existing?.paid_total ?? 0).toLocaleString()}`
                                    : `${text.guests}: ${imported.guests} · BarTicket ${existing?.guest_count ?? "—"}`);
                            return <MobileRecord key={imported.line} title={imported.date} fields={[
                                { label: ja ? "マネージャー（勤務表）" : "Manager (spreadsheet)", value: imported.manager },
                                { label: ja ? "マネージャー（BarTicket）" : "Manager (BarTicket)", value: existing?.opened_by ?? "—" },
                                { label: ja ? "イベント" : "Event", value: imported.event || "—" },
                                { label: ja ? "売上（勤務表 / BarTicket）" : "Revenue (spreadsheet / BarTicket)", value: `¥${imported.revenue.toLocaleString()} / ${existing ? `¥${existing.paid_total.toLocaleString()}` : "—"}` },
                                { label: ja ? "来客数（勤務表 / BarTicket）" : "Guests (spreadsheet / BarTicket)", value: `${imported.guests} / ${existing?.guest_count ?? "—"}` },
                                { label: ja ? "差異" : "Differences", value: state === "new" ? (ja ? "記録なし" : "No recorded shift") : state === "match" ? (ja ? "一致" : "Match") : details.join("; ") },
                            ]} />;
                        })}
                    </MobileRows>
                    <Actions>
                        <button type="button" className="secondary" onClick={() => void copyComparisonReport()}>
                            {ja ? "比較レポートJSONをコピー" : "Copy comparison JSON"}
                        </button>
                        <p>{ja ? "読み取り専用の比較結果です。APIへの送信・インポートは行いません。" : "Read-only comparison report. No API submission or import will occur."}</p>
                    </Actions>
                    {reportNotice ? <p role="status">{reportNotice}</p> : null}
                </details> : null}
            </> : null}
            <Block>
                <StepHeading><span>3</span><h4>{ja ? "勤務時間を照合して確認" : "Reconcile and review staff hours"}</h4></StepHeading>
                <p>{ja ? "2026年10月から1か月ずつ確認します。実際の打刻時刻は作成せず、差異修正は理由とともに監査記録へ保存します。" : "Review one month at a time, starting with October 2026. No clock times are created; corrections to conflicting totals are audited with a reason."}</p>
                <Actions>
                    <button type="button" className="secondary" disabled={!csv || historyBusy} onClick={() => void reconcileHistory()}>
                        {historyBusy ? (ja ? "処理中…" : "Working…") : (ja ? "勤務時間を照合" : "Reconcile staff hours")}
                    </button>
                    {historyPreview?.rows.some(row => (row.state === "new" || row.state === "conflict") && row.user_id !== null) ? <button type="button" className="hollow secondary" disabled={historyBusy} onClick={() => {
                        setSelectedHistoryCells(historyPreview.rows.filter(row => (row.state === "new" || row.state === "conflict") && row.user_id !== null)
                            .map(row => historyCellKey(row.source_row, row.source_column)));
                    }}>{ja ? "不足分と差異をすべて選択" : "Select all missing rows and conflicts"}</button> : null}
                </Actions>
                {historyError ? <p role="alert">{historyError}</p> : null}
                {historyPreview ? <>
                    <p role="status">{historyBatch?.sourceFile} · {ja ? "一致" : "Matches"}: {historyPreview.counts.match} · {ja ? "不足" : "Missing"}: {historyPreview.counts.new} · {ja ? "差異" : "Conflicts"}: {historyPreview.counts.conflict} · {ja ? "未対応名" : "Unmapped"}: {historyPreview.counts.unmapped} · {ja ? "重複候補" : "Duplicate candidates"}: {historyPreview.counts.duplicate_candidate}</p>
                    <DesktopRows><TableWrap><table><thead><tr><th>{ja ? "取り込み" : "Import"}</th><th>{text.date}</th><th>{ja ? "スタッフ" : "Staff"}</th><th>{ja ? "勤務表時間" : "Spreadsheet hours"}</th><th>{ja ? "現在の有効時間" : "Current effective hours"}</th><th>{ja ? "結果" : "Result"}</th><th>{ja ? "出典" : "Source"}</th></tr></thead>
                        <tbody>{historyPreview.rows.map(row => {
                            const cellKey = historyCellKey(row.source_row, row.source_column);
                            const canImport = (row.state === "new" || row.state === "conflict") && row.user_id !== null;
                            const statusLabel = row.state === "new" ? (ja ? "不足" : "Missing")
                                : row.state === "match" ? (ja ? "一致" : "Match")
                                        : row.state === "conflict" ? (ja ? "差異・要理由" : "Conflict — reason required")
                                        : row.state === "unmapped" ? (ja ? "未対応名" : "Unmapped")
                                            : row.state === "duplicate_candidate" ? (ja ? "重複候補" : "Duplicate")
                                                : row.state === "already_imported" ? (ja ? "取り込み済み" : "Imported")
                                                    : (ja ? "却下済み" : "Rejected");
                            return <tr key={cellKey}>
                                <td><input type="checkbox" aria-label={`${row.business_date} ${row.staff_name} ${row.source_seconds / 3600} hours`}
                                    disabled={!canImport || historyBusy} checked={canImport && selectedHistoryCells.includes(cellKey)}
                                    onChange={event => setSelectedHistoryCells(current => event.target.checked
                                        ? [...current, cellKey]
                                        : current.filter(item => item !== cellKey))} /></td>
                                <td>{row.business_date}</td><td>{row.staff_name}</td><td>{row.source_seconds / 3600}</td>
                                <td>{row.effective_seconds === null ? (ja ? "不明" : "Unknown") : row.effective_seconds / 3600}</td>
                                <td>{statusLabel} — {row.reason}</td><td>{row.source_row} · {row.source_column}</td>
                            </tr>;
                        })}</tbody></table></TableWrap></DesktopRows>
                    <MobileRows role="list" aria-label={ja ? "勤務時間の照合結果" : "Staff-hours reconciliation results"}>
                        {historyPreview.rows.map(row => {
                            const cellKey = historyCellKey(row.source_row, row.source_column);
                            const canImport = (row.state === "new" || row.state === "conflict") && row.user_id !== null;
                            const statusLabel = row.state === "new" ? (ja ? "不足" : "Missing")
                                : row.state === "match" ? (ja ? "一致" : "Match")
                                    : row.state === "conflict" ? (ja ? "差異・要理由" : "Conflict — reason required")
                                        : row.state === "unmapped" ? (ja ? "未対応名" : "Unmapped")
                                            : row.state === "duplicate_candidate" ? (ja ? "重複候補" : "Duplicate")
                                                : row.state === "already_imported" ? (ja ? "取り込み済み" : "Imported")
                                                    : (ja ? "却下済み" : "Rejected");
                            const checkbox = <label className="import-choice"><input type="checkbox"
                                aria-label={`${row.business_date} ${row.staff_name} ${row.source_seconds / 3600} hours`}
                                disabled={!canImport || historyBusy} checked={canImport && selectedHistoryCells.includes(cellKey)}
                                onChange={event => setSelectedHistoryCells(current => event.target.checked
                                    ? [...current, cellKey]
                                    : current.filter(item => item !== cellKey))} />
                                {ja ? "選択" : "Select"}</label>;
                            return <MobileRecord key={cellKey} title={`${row.business_date} · ${row.staff_name}`} fields={[
                                { label: ja ? "取り込み" : "Import", value: checkbox },
                                { label: ja ? "勤務表時間" : "Spreadsheet hours", value: `${row.source_seconds / 3600} h` },
                                { label: ja ? "現在の有効時間" : "Current effective hours", value: row.effective_seconds === null ? (ja ? "不明" : "Unknown") : `${row.effective_seconds / 3600} h` },
                                { label: ja ? "結果・理由" : "Result and reason", value: `${statusLabel} — ${row.reason}` },
                                { label: ja ? "出典" : "Source", value: `${row.source_row} · ${row.source_column}` },
                            ]} />;
                        })}
                    </MobileRows>
                    <StepHeading><span>4</span><h4>{ja ? "選択した勤務時間を保存" : "Save the selected staff hours"}</h4></StepHeading>
                    <Actions>
                        {selectedHistoryCells.some(key => historyPreview.rows.some(row => row.state === "conflict" && row.user_id !== null && historyCellKey(row.source_row, row.source_column) === key)) ? <label>
                            {ja ? "差異の修正理由（監査記録）" : "Reason for correcting spreadsheet conflicts (audited)"}
                            <input value={historyCorrectionReason} maxLength={1000}
                                onChange={event => setHistoryCorrectionReason(event.target.value)}
                                placeholder={ja ? "例：2026年10月の確認済み勤務表に合わせて修正" : "e.g. Corrected to match the verified October 2026 staff-hours sheet"} />
                        </label> : null}
                        <button type="button" disabled={!selectedHistoryCells.length || historyBusy} onClick={() => void importHistory()}>
                            {ja ? `選択した時間を保存 (${selectedHistoryCells.length})` : `Save selected hours (${selectedHistoryCells.length})`}
                        </button>
                        <p>{ja ? "差異の修正は理由とともに監査記録へ保存され、元の打刻時刻は変更されません。" : "Corrections are audited with your reason. Original clock timestamps are preserved."}</p>
                    </Actions>
                </> : null}
            </Block>
        </Block>
    </Wrap>;
}

const Wrap = styled.div`display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; h2 { font-size: var(--font-size-h4); } h3 { font-size: var(--font-size-default); } label { display: flex; flex-direction: column; gap: var(--space-0); min-width: 0; } input,select { width: 100%; box-sizing: border-box; } .import-choice { flex-direction: row; align-items: center; } .import-choice input { width: auto; min-width: 20px; min-height: 20px; } details > summary { cursor: pointer; font-weight: 600; padding: var(--space-1) 0; }`;
const Block = styled.section`display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); background: var(--neutral-900); border-radius: 12px; min-width: 0;`;
const Notice = styled.div`padding: var(--space-2); border: 1px solid var(--neutral-600); border-radius: 8px; p { margin-top: var(--space-1); }`;
const StepHeading = styled.div`display: flex; align-items: center; gap: var(--space-1); h3,h4 { margin: 0; } span { display: grid; place-items: center; flex: 0 0 2rem; height: 2rem; border-radius: 50%; background: var(--royal-500); color: white; font-weight: 700; }`;
const DesktopRows = styled.div`display: block; @media (max-width: 700px) { display: none; }`;
const MobileRows = styled.div`display: none; @media (max-width: 700px) { display: grid; gap: var(--space-1); }`;
const RecordCard = styled.article`padding: var(--space-1) var(--space-2); border: 1px solid var(--neutral-700); border-radius: 10px; background: var(--neutral-800); min-width: 0; h5 { margin: 0 0 var(--space-1); font-size: var(--font-size-default); font-weight: 600; overflow-wrap: anywhere; } dl { margin: 0; } dl > div { display: grid; grid-template-columns: minmax(7rem, 0.8fr) minmax(0, 1.2fr); gap: var(--space-1); padding: 0.55rem 0; border-top: 1px solid var(--neutral-700); } dt { color: var(--neutral-300); } dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }`;
const TableWrap = styled.div`overflow-x: auto; width: 100%; table { border-collapse: collapse; min-width: 650px; width: 100%; } th, td { text-align: left; padding: var(--space-1); border-bottom: 1px solid var(--neutral-700); } td button { width: auto; }`;
const Editor = styled.div`display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--neutral-600); border-radius: 8px;`;
const Fields = styled.div`display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-1); @media (min-width: 700px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }`;
const Actions = styled.div`display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; button,select { width: auto; }`;

const SelectBox = styled.span`
    position: relative; display: block;
    select { appearance: none; -webkit-appearance: none; padding-right: 2.5em; background: var(--dark); }
`;
const Caret = styled.span`
    position: absolute; right: 1em; top: 50%; transform: translateY(-50%);
    pointer-events: none; color: var(--neutral-300); font-size: 1.15em;
`;
const RadioRow = styled.div`
    display: flex; gap: var(--space-2); flex-wrap: wrap;
    label { display: inline-flex; flex-direction: row; align-items: center; gap: var(--space-1); cursor: pointer; }
    input { width: auto; }
`;
