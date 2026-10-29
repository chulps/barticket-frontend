import { useEffect, useState } from "react";
import styled from "styled-components";
import { accountApi, type Account, type HourlyRatePreview, type HourlyRateRecord, type ShiftPunch } from "../api/account";
import TabGroup from "../components/TabGroup";
import { localeTag, type Locale } from "../i18n";
import type { StaffActivityRow } from "./staffProfileData";
import {
    initialRateDraft, initialDrinkbackDraft, initialBonusDraft,
    validRateDraft, validDrinkbackDraft, validBonusDraft,
    type DrinkbackMode,
} from "./adminTeamDrafts";

export type AdminDrinkLine = {
    shiftId: number;
    businessDate: string;
    ticketId: number;
    name: string;
    quantity: number;
    revenue: number;
};

type EditorTab = "terms" | "time" | "drinks";
type Props = {
    person: Account;
    locale: Locale;
    rows: StaffActivityRow[];
    drinkLines: AdminDrinkLine[];
    onRefresh: () => void;
};

function dateLabel(value: string, locale: Locale) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(localeTag(locale), {
        year: "numeric", month: "short", day: "numeric",
    });
}
function hoursLabel(seconds: number) {
    return (seconds / 3600).toFixed(2) + " h";
}

/** No write requests: these editable controls are explicitly UNSAVED proposals. */
function PunchCorrectionCard({
    shiftId, businessDate, punch, locale, onSaved,
}: {
    shiftId: number;
    businessDate: string;
    punch: ShiftPunch;
    locale: Locale;
    onSaved: () => void;
}) {
    const ja = locale === "ja";
    const originalIn = unixSecondsToJstInput(punch.clock_in);
    const originalOut = punch.clock_out === null ? "" : unixSecondsToJstInput(punch.clock_out);
    const [clockIn, setClockIn] = useState(originalIn);
    const [clockOut, setClockOut] = useState(originalOut);
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        setClockIn(originalIn);
        setClockOut(originalOut);
        setReason("");
        setError("");
    }, [punch.id, punch.clock_in, punch.clock_out]);

    const changed = clockIn !== originalIn || clockOut !== originalOut;
    const valid = changed && validPunchCorrection(clockIn, clockOut) && reason.trim().length > 0 && !saving;

    async function saveCorrection() {
        if (!valid) return;
        const confirmed = window.confirm(ja
            ? "この出退勤時刻を修正し、理由と変更履歴を保存します。続行しますか？"
            : "Save this clock-time correction with its reason and audit history?");
        if (!confirmed) return;
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const correctedIn = jstInputToIso(clockIn);
            const correctedOut = jstInputToIso(clockOut);
            if (!correctedIn || !correctedOut) throw new Error(ja ? "時刻を確認してください。" : "Check the clock times.");
            await accountApi.correctPunch(shiftId, punch.id, {
                corrected_clock_in: correctedIn,
                corrected_clock_out: correctedOut,
                reason: reason.trim(),
            });
            setSuccess(ja ? "修正を保存しました。監査履歴に記録されています。" : "Correction saved to audit history.");
            setReason("");
            onSaved();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message :
                (ja ? "打刻を修正できませんでした。" : "Could not correct this punch."));
        } finally {
            setSaving(false);
        }
    }

    const history = punch.correction_history ?? [];
    return (
        <Card>
            <strong>{dateLabel(businessDate, locale)} · {punch.name}</strong>
            <Fields>
                <label>{ja ? "出勤（日本時間）" : "Clock in (JST)"}
                    <input type="datetime-local" step="1" value={clockIn}
                        onChange={event => { setClockIn(event.target.value); setError(""); setSuccess(""); }} />
                </label>
                <label>{ja ? "退勤（日本時間）" : "Clock out (JST)"}
                    <input type="datetime-local" step="1" value={clockOut}
                        onChange={event => { setClockOut(event.target.value); setError(""); setSuccess(""); }} />
                </label>
                <label>{ja ? "修正理由（必須）" : "Reason (required)"}
                    <textarea rows={2} maxLength={255} value={reason}
                        onChange={event => { setReason(event.target.value); setError(""); setSuccess(""); }} />
                </label>
            </Fields>
            <Help>{ja
                ? "記録値は変更せず、修正後の値と理由を履歴に追加します。"
                : "Original recorded timestamps remain intact; the correction and reason are appended to history."}</Help>
            {error ? <p role="alert">{error}</p> : null}
            {success ? <p role="status">{success}</p> : null}
            <Actions>
                <button type="button" disabled={!valid} onClick={() => void saveCorrection()}>
                    {saving ? (ja ? "保存中…" : "Saving…") : (ja ? "修正を保存" : "Save correction")}
                </button>
            </Actions>
            {history.length ? (
                <details>
                    <summary>{ja ? "修正履歴" : "Correction history"} ({history.length})</summary>
                    {history.map(event => (
                        <p key={event.correction_id}>
                            {event.field === "clock_in" ? (ja ? "出勤" : "Clock in") : (ja ? "退勤" : "Clock out")}: {new Date(event.previous_at * 1000).toLocaleString(localeTag(locale), { timeZone: "Asia/Tokyo" })} → {new Date(event.corrected_at * 1000).toLocaleString(localeTag(locale), { timeZone: "Asia/Tokyo" })}
                            {" · "}{event.corrected_by}: {event.reason}
                        </p>
                    ))}
                </details>
            ) : null}
        </Card>
    );
}

export default function AdminTeamEditors({ person, locale, rows, drinkLines, onRefresh }: Props) {
    const ja = locale === "ja";
    const [tab, setTab] = useState<EditorTab>("terms");
    const [rate, setRate] = useState({ ...initialRateDraft, basis: "hourly" as const });
    const [drinkback, setDrinkback] = useState(initialDrinkbackDraft);
    const [bonus, setBonus] = useState(initialBonusDraft);
    const [copyNotice, setCopyNotice] = useState("");
    const [rateHistory, setRateHistory] = useState<HourlyRateRecord[]>([]);
    const [rateLoading, setRateLoading] = useState(true);
    const [rateError, setRateError] = useState("");
    const [preview, setPreview] = useState<HourlyRatePreview | null>(null);
    const [previewError, setPreviewError] = useState("");
    const [previewing, setPreviewing] = useState(false);
    const [savingRate, setSavingRate] = useState(false);
    const [rateSaveError, setRateSaveError] = useState("");
    const [rateSaveSuccess, setRateSaveSuccess] = useState("");

    useEffect(() => {
        let cancelled = false;
        setRateLoading(true);
        setRateError("");
        accountApi.hourlyRates(person.id).then(result => {
            if (!cancelled) setRateHistory(result.hourly_rates);
        }).catch(error => {
            if (!cancelled) setRateError(error instanceof Error ? error.message :
                (ja ? "給与レートを読み込めませんでした。" : "Could not load hourly-rate history."));
        }).finally(() => {
            if (!cancelled) setRateLoading(false);
        });
        return () => { cancelled = true; };
    }, [person.id, ja]);

    function updateRate(patch: Partial<Omit<typeof rate, "basis">>) {
        setRate(current => ({ ...current, ...patch, basis: "hourly" }));
        setPreview(null);
        setPreviewError("");
        setRateSaveError("");
        setRateSaveSuccess("");
    }

    async function previewRateChange() {
        if (!readyRate) return;
        setPreviewing(true);
        setPreviewError("");
        setRateSaveError("");
        setRateSaveSuccess("");
        try {
            const result = await accountApi.previewHourlyRate({
                user_id: person.id,
                hourly_rate_yen: Number(rate.hourlyYen),
                effective_from: rate.effectiveFrom,
            });
            setPreview(result);
        } catch (error) {
            setPreview(null);
            setPreviewError(error instanceof Error ? error.message :
                (ja ? "変更の影響を確認できませんでした。" : "Could not preview the rate change."));
        } finally {
            setPreviewing(false);
        }
    }

    async function saveRateChange() {
        if (!readyRate || !previewMatchesRate || savingRate) return;
        const confirmed = window.confirm(ja
            ? `時給を ¥${Number(rate.hourlyYen).toLocaleString()}/時に、${rate.effectiveFrom} から設定します。変更履歴に記録されます。続行しますか？`
            : `Set the hourly rate to ¥${Number(rate.hourlyYen).toLocaleString()}/h effective ${rate.effectiveFrom}? This change will be recorded in history.`);
        if (!confirmed) return;
        setSavingRate(true);
        setRateSaveError("");
        setRateSaveSuccess("");
        try {
            await accountApi.setHourlyRate({
                user_id: person.id,
                hourly_rate_yen: Number(rate.hourlyYen),
                effective_from: rate.effectiveFrom,
                reason: rate.reason.trim(),
            });
            const result = await accountApi.hourlyRates(person.id);
            setRateHistory(result.hourly_rates);
            setRate({ ...initialRateDraft, basis: "hourly" });
            setPreview(null);
            setRateSaveSuccess(ja ? "時給と変更履歴を保存しました。" : "Hourly rate saved to the audited rate history.");
        } catch (error) {
            setRateSaveError(error instanceof Error ? error.message :
                (ja ? "時給を保存できませんでした。" : "Could not save the hourly rate."));
        } finally {
            setSavingRate(false);
        }
    }

    async function copyProposal(kind: "drinkback" | "bonus") {
        const payload = kind === "drinkback"
            ? { action: "propose-drinkback-rule", ...drinkback }
            : { action: "propose-bonus-adjustment", ...bonus };
        try {
            await navigator.clipboard.writeText(JSON.stringify({
                status: "UNSAVED_PROPOSAL_ONLY", employee_id: person.id,
                employee_name: person.name, ...payload,
            }, null, 2));
            setCopyNotice(ja
                ? "下書きJSONをコピーしました。APIにも給与記録にも保存されていません。"
                : "Draft JSON copied. Nothing was saved to the API or payroll records.");
        } catch {
            setCopyNotice(ja ? "コピーできませんでした。ブラウザの権限を確認してください。" :
                "Copy failed. Check your browser's clipboard permissions.");
        }
    }
    const correctablePunches = rows.flatMap(row =>
        row.status === "closed"
            ? row.punches.filter(punch => punch.clock_out !== null).map(punch => ({ row, punch }))
            : [],
    );
    const drinkShifts = [...new Set(drinkLines.map(row => row.shiftId))];
    const readyRate = validRateDraft(rate) && Number(rate.hourlyYen) <= 10_000_000;
    const previewMatchesRate = preview?.user_id === person.id && preview.proposed_hourly_rate_yen === Number(rate.hourlyYen) && preview.effective_from === rate.effectiveFrom;
    const readyDrinkback = validDrinkbackDraft(drinkback);
    const readyBonus = validBonusDraft(bonus, drinkShifts);

    return (
        <Area aria-label={ja ? person.name + " の管理" : "Manage " + person.name}>
            <Header>
                <div>
                    <h3>{ja ? "スタッフ設定・調整" : "Staff settings & adjustments"}</h3>
                    <p>{ja ? "時給レートは監査履歴に保存。勤務時間とドリンク手当はまだ下書きです。" : "Hourly rates save to audit history. Time and drink-bonus proposals remain drafts."}</p>
                </div>
                <Pill>{ja ? "時給レート管理" : "AUDITED HOURLY RATES"}</Pill>
            </Header>
            <Notice role="note">
                {ja
                    ? "時給レートはマネージャーのみ変更できます。勤務時間の修正とドリンク手当はまだ保存できません。表示される影響額は勤務時間に基づく未丸めの試算で、最終給与ではありません。"
                    : "Only managers can change hourly rates. Time corrections and drink bonuses are not yet saveable. Impact figures are unrounded estimates based on recorded hours, not final payroll."}
            </Notice>
            {copyNotice ? <Notice role="status">{copyNotice}</Notice> : null}
            <StaffTabSurface>
                <TabGroup
                    tabs={[
                        { id: "terms", label: ja ? "給与・レート" : "Pay & rates" },
                        { id: "time", label: ja ? "勤務時間" : "Time corrections" },
                        { id: "drinks", label: ja ? "ドリンク手当" : "Drink bonuses" },
                    ]}
                    activeTab={tab}
                    onChange={setTab}
                />
            </StaffTabSurface>
            {tab === "terms" ? (
                <Content role="tabpanel">
                    <Intro>
                        <h4>{ja ? "現在の時給レート" : "Current hourly rate"}</h4>
                        {rateLoading ? <p role="status">{ja ? "レート履歴を読み込み中…" : "Loading rate history…"}</p> :
                            rateError ? <p role="alert">{rateError}</p> :
                                (() => {
                                    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
                                    const current = [...rateHistory].reverse().find(item => item.effective_from <= today);
                                    return current
                                        ? <p><strong>¥{current.hourly_rate_yen.toLocaleString()}/h</strong> · {ja ? "適用開始" : "Effective from"} {dateLabel(current.effective_from, locale)}</p>
                                        : <p><strong>—</strong> {ja ? "現在の時給レートは未登録です。0円を意味しません。" : "No current hourly rate is recorded. This does not mean ¥0."}</p>;
                                })()}
                    </Intro>
                    <Card>
                        <h4>{ja ? "時給レートを設定" : "Set hourly rate"}</h4>
                        <Fields>
                            <label>{ja ? "時給（円）" : "Hourly rate (JPY)"}
                                <input type="number" min="0" max="10000000" step="1"
                                    value={rate.hourlyYen} placeholder="—"
                                    onChange={e => updateRate({ hourlyYen: e.target.value })} />
                            </label>
                            <label>{ja ? "適用開始日" : "Effective from"}
                                <input type="date" value={rate.effectiveFrom}
                                    onChange={e => updateRate({ effectiveFrom: e.target.value })} />
                            </label>
                            <label>{ja ? "変更理由（必須）" : "Reason (required)"}
                                <textarea rows={2} maxLength={1000} value={rate.reason}
                                    onChange={e => updateRate({ reason: e.target.value })} />
                            </label>
                        </Fields>
                        <Help>{ja
                            ? "過去の日付を指定する場合は、保存前に影響を確認して明示的に承認します。"
                            : "If you choose a past date, review the impact and explicitly confirm before saving."}</Help>
                        {preview && previewMatchesRate ? (
                            <Preview role="status">
                                <strong>{ja ? "影響プレビュー（未丸め）" : "Impact preview (unrounded estimate)"}</strong>
                                <span>{ja ? "対象期間" : "Affected period"}: {dateLabel(preview.effective_from, locale)}{preview.period_end ? " – " + dateLabel(preview.period_end, locale) : ""}</span>
                                <span>{ja ? "対象勤務時間" : "Hours in period"}: {(preview.affected_hours_seconds / 3600).toFixed(2)} h</span>
                                <span>{ja ? "提案レートの賃金試算" : "Estimated gross at proposed rate"}: ¥{preview.proposed_gross_estimate_yen_unrounded}</span>
                                {preview.current_gross_estimate_yen_unrounded !== null
                                    ? <span>{ja ? "既存レートでの比較試算" : "Estimate using previous rate"}: ¥{preview.current_gross_estimate_yen_unrounded} · {ja ? "差額" : "Change"}: {preview.change_yen_unrounded === null ? "—" : "¥" + preview.change_yen_unrounded}</span>
                                    : <span>{ja ? "以前の有効レートがないため差額は算出できません。" : "No earlier effective rate is available, so the change cannot be calculated."}</span>}
                                <Help>{preview.note}</Help>
                            </Preview>
                        ) : null}
                        {previewError ? <p role="alert">{previewError}</p> : null}
                        {rateSaveError ? <p role="alert">{rateSaveError}</p> : null}
                        {rateSaveSuccess ? <p role="status">{rateSaveSuccess}</p> : null}
                        <Actions>
                            <button type="button" className="hollow secondary" onClick={() => updateRate({ hourlyYen: "", effectiveFrom: "", reason: "" })}>{ja ? "クリア" : "Clear draft"}</button>
                            <button type="button" className="secondary" disabled={!readyRate || rateLoading || !!rateError || previewing || savingRate}
                                onClick={() => void previewRateChange()}>{previewing ? (ja ? "確認中…" : "Previewing…") : (ja ? "影響をプレビュー" : "Preview impact")}</button>
                            <button type="button" disabled={!readyRate || rateLoading || !!rateError || !previewMatchesRate || savingRate}
                                onClick={() => void saveRateChange()}>{savingRate ? (ja ? "保存中…" : "Saving…") : (ja ? "確認して保存" : "Confirm and save")}</button>
                        </Actions>
                    </Card>
                    <Card>
                        <h4>{ja ? "時給レート履歴" : "Hourly-rate history"}</h4>
                        {rateHistory.length ? (
                            <Records>
                                {[...rateHistory].reverse().map(item => (
                                    <Record key={item.id}>
                                        <div>
                                            <strong>¥{item.hourly_rate_yen.toLocaleString()}/h · {dateLabel(item.effective_from, locale)}</strong>
                                            <Muted>{ja ? "適用終了" : "Through"}: {item.effective_through ? dateLabel(item.effective_through, locale) : (ja ? "現在" : "Current")} · {ja ? "変更者" : "Changed by"}: {item.changed_by_name}</Muted>
                                            <Muted>{item.reason}{item.source ? " · " + item.source : ""}</Muted>
                                        </div>
                                    </Record>
                                ))}
                            </Records>
                        ) : <Muted>{rateLoading ? (ja ? "読み込み中…" : "Loading…") : (ja ? "レート履歴がありません。" : "No hourly-rate history recorded.")}</Muted>}
                    </Card>
                    <Card>
                        <h4>{ja ? "スタッフドリンクのバック率設定案" : "Propose staff-drink bonus rule"}</h4>
                        <p>{ja ? "記録されたドリンク数から報酬額はまだ計算できません。対象条件・キャンセル・計算単位は未確定です。" : "Drink counts do not establish earned bonuses. Eligibility, refunds and calculation rules require backend approval."}</p>
                        <Fields>
                            <label>{ja ? "計算方法" : "Bonus method"}
                                <select value={drinkback.mode} onChange={e => setDrinkback({ ...drinkback, mode: e.target.value as DrinkbackMode })}>
                                    <option value="">{ja ? "選択してください" : "Select method"}</option>
                                    <option value="none">{ja ? "バックなし" : "No bonus"}</option>
                                    <option value="fixed">{ja ? "対象ドリンク1杯あたり定額（円）" : "Fixed JPY per eligible drink"}</option>
                                    <option value="percentage">{ja ? "対象ドリンク売上の割合（%）" : "Percent of eligible drink revenue"}</option>
                                </select>
                            </label>
                            {drinkback.mode === "fixed" || drinkback.mode === "percentage" ? (
                                <label>{drinkback.mode === "fixed" ? (ja ? "定額（円）" : "JPY per drink") : (ja ? "割合（%）" : "Percentage")}
                                    <input type="number" min="0" max={drinkback.mode === "percentage" ? "100" : "1000000000"}
                                        step="1" value={drinkback.amount} onChange={e => setDrinkback({ ...drinkback, amount: e.target.value })} />
                                </label>
                            ) : null}
                            <label>{ja ? "適用開始日" : "Effective from"}
                                <input type="date" value={drinkback.effectiveFrom}
                                    onChange={e => setDrinkback({ ...drinkback, effectiveFrom: e.target.value })} />
                            </label>
                            <label>{ja ? "設定理由（必須）" : "Reason (required)"}
                                <textarea rows={2} maxLength={500} value={drinkback.reason}
                                    onChange={e => setDrinkback({ ...drinkback, reason: e.target.value })} />
                            </label>
                        </Fields>
                        {readyDrinkback ? <Preview role="status">
                            {ja ? "設定案（未保存）" : "Proposed rule (unsaved)"}: {drinkback.mode === "fixed"
                                ? "¥" + Number(drinkback.amount).toLocaleString() + (ja ? "/杯" : "/drink")
                                : drinkback.mode === "percentage" ? drinkback.amount + "%" : (ja ? "バックなし" : "No bonus")}
                            {" · "}{drinkback.effectiveFrom}
                        </Preview> : <Help>{ja ? "計算方法・適用日・理由を入力してください。" : "Choose a method, effective date and reason."}</Help>}
                        <Actions>
                            <button type="button" className="hollow secondary" onClick={() => setDrinkback(initialDrinkbackDraft)}>{ja ? "クリア" : "Clear draft"}</button>
                            <button type="button" className="secondary" disabled={!readyDrinkback} onClick={() => void copyProposal("drinkback")}>{ja ? "設定案をコピー" : "Copy rule proposal"}</button>
                            <button type="button" disabled title={ja ? "保存API未対応" : "Awaiting manager-only save API"}>{ja ? "保存（未対応）" : "Save — unavailable"}</button>
                        </Actions>
                    </Card>
                </Content>
            ) : null}

            {tab === "time" ? (
                <Content role="tabpanel">
                    <Intro>
                        <h4>{ja ? "記録済みの打刻を修正" : "Correct recorded clock punches"}</h4>
                        <p>{ja
                            ? "実際に記録された出退勤時刻だけを、理由とともに監査履歴へ保存します。時刻は日本時間（JST）です。スプレッドシートの合計時間は別の記録です。"
                            : "Correct only real recorded clock-in/out timestamps. Each change requires a reason and is saved to audit history. Times are shown in Japan time (JST); spreadsheet hour totals are separate records."}</p>
                    </Intro>
                    {correctablePunches.length ? (
                        <Records>
                            {correctablePunches.map(({ row, punch }) => (
                                <PunchCorrectionCard
                                    key={punch.id}
                                    shiftId={row.shiftId}
                                    businessDate={row.businessDate}
                                    punch={punch}
                                    locale={locale}
                                    onSaved={onRefresh}
                                />
                            ))}
                        </Records>
                    ) : (
                        <Help>{ja
                            ? "このメンバーに修正できる終了済みの打刻はありません。"
                            : "There are no completed clock punches for this staff member to correct."}</Help>
                    )}
                </Content>
            ) : null}

            {tab === "drinks" ? (
                <Content role="tabpanel">
                    <Intro>
                        <h4>{ja ? "記録されたスタッフドリンク" : "Recorded staff drinks"}</h4>
                        <p>{ja ? "本人IDに紐づいた記録のみ。表示額は売上であり、支払うバック金額ではありません。" : "Only drinks linked by staff ID. Revenue shown below is a recorded sale amount, NOT an earned bonus."}</p>
                    </Intro>
                    {drinkLines.length ? (
                        <Records>
                            {drinkLines.slice(0, 60).map((line, index) => (
                                <Record key={line.shiftId + ":" + line.ticketId + ":" + index}>
                                    <div>
                                        <strong>{dateLabel(line.businessDate, locale)} · {line.name} × {line.quantity}</strong>
                                        <Muted>#{line.ticketId} · {ja ? "記録された売上" : "Recorded line revenue"}: ¥{line.revenue.toLocaleString()}</Muted>
                                    </div>
                                </Record>
                            ))}
                            {drinkLines.length > 60 ? <Muted>{ja ? "最新60件を表示" : "Showing latest 60 entries"}</Muted> : null}
                        </Records>
                    ) : <Muted>{ja ? "本人IDに紐づいたドリンク記録がありません。未記録の可能性があります。" : "No drink records linked to this user ID; older records may be incomplete."}</Muted>}
                    <Card>
                        <h4>{ja ? "ドリンク手当の調整案" : "Propose a manual drink-bonus adjustment"}</h4>
                        <p>{ja ? "この調整案はスタッフドリンクの販売記録を変更しません。" : "This proposal never changes original staff-drink or ticket sales records."}</p>
                        <Fields>
                            <label>{ja ? "対象シフト" : "Shift with recorded drinks"}
                                <select value={bonus.shiftId} onChange={e => setBonus({ ...bonus, shiftId: e.target.value })}>
                                    <option value="">{ja ? "選択してください" : "Select shift"}</option>
                                    {drinkShifts.map(id => {
                                        const line = drinkLines.find(item => item.shiftId === id);
                                        return <option key={id} value={id}>{line ? dateLabel(line.businessDate, locale) : id}</option>;
                                    })}
                                </select>
                            </label>
                            <label>{ja ? "調整額（円、マイナス可）" : "Adjustment (JPY, negative allowed)"}
                                <input type="number" step="1" value={bonus.adjustmentYen}
                                    onChange={e => setBonus({ ...bonus, adjustmentYen: e.target.value })} />
                            </label>
                            <label>{ja ? "調整理由（必須）" : "Adjustment reason (required)"}
                                <textarea rows={3} maxLength={500} value={bonus.reason}
                                    onChange={e => setBonus({ ...bonus, reason: e.target.value })} />
                            </label>
                        </Fields>
                        {readyBonus ? <Preview role="status">
                            {ja ? "調整案（未保存）" : "Proposed adjustment (unsaved)"}: {Number(bonus.adjustmentYen) >= 0 ? "+" : "−"}¥{Math.abs(Number(bonus.adjustmentYen)).toLocaleString()}
                        </Preview> : <Help>{ja ? "対象シフト・0以外の整数の円金額・理由を入力してください。" : "Choose a shift, a nonzero whole-yen adjustment and a reason."}</Help>}
                        <Actions>
                            <button type="button" className="hollow secondary" onClick={() => setBonus(initialBonusDraft)}>{ja ? "クリア" : "Clear draft"}</button>
                            <button type="button" className="secondary" disabled={!readyBonus} onClick={() => void copyProposal("bonus")}>{ja ? "調整案をコピー" : "Copy bonus adjustment"}</button>
                            <button type="button" disabled title={ja ? "修正API未対応" : "Awaiting approved adjustment API"}>{ja ? "調整を保存（未対応）" : "Save adjustment — unavailable"}</button>
                        </Actions>
                    </Card>
                </Content>
            ) : null}

        </Area>
    );
}

const Area = styled.section`
    min-width: 0; display: flex; flex-direction: column; gap: var(--space-2);
    h3 { font-size: var(--font-size-h4); font-weight: 500; }
    h4 { font-size: var(--font-size-default); font-weight: 600; }
`;
const Header = styled.div`
    display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:var(--space-1);
    p { color:var(--neutral-300); }
`;
const Pill = styled.span`
    font-size:var(--font-size-small); color:var(--neutral-200); border:1px solid var(--neutral-600);
    border-radius:999px; padding:4px 10px; white-space:nowrap;
`;
const Notice = styled.p`
    padding:var(--space-2); border:1px solid var(--neutral-600); border-radius:8px;
    color:var(--neutral-300); line-height:1.5;
`;

const StaffTabSurface = styled.div`
    background: var(--neutral-900);
    border-radius: var(--space-1);
    min-width: 0;
`;
const Content = styled.div`display:flex; flex-direction:column; gap:var(--space-2); min-width:0;`;
const Intro = styled.div`display:flex; flex-direction:column; gap:4px; p{color:var(--neutral-300);}`;
const Card = styled.section`
    display:flex; flex-direction:column; gap:var(--space-1); min-width:0;
    padding:var(--space-2); background:var(--neutral-900); border-radius:8px;
    p {line-height:1.5}
`;
const Fields = styled.div`
    display:grid; gap:var(--space-1);
    @media(min-width:700px){grid-template-columns:repeat(2,minmax(0,1fr));}
    label{display:flex; flex-direction:column; gap:var(--space-0); min-width:0;}
    input,select,textarea{width:100%;box-sizing:border-box;background:var(--dark);}
    textarea{resize:vertical;}
`;
const Actions = styled.div`
    display:flex;gap:var(--space-1);flex-wrap:wrap;
    button{width:auto;}
    button:disabled{opacity:.55;cursor:not-allowed;}
`;
const Preview = styled.div`padding:var(--space-1);background:var(--neutral-800);border-radius:8px;span{display:block;}`;
const Help = styled.p`color:var(--neutral-300);font-size:var(--font-size-small);`;
const Records = styled.div`display:flex;flex-direction:column;gap:var(--space-1);`;
const Record = styled.div`
    padding:var(--space-1);border-bottom:1px solid var(--neutral-700);
    strong{font-weight:500;}
`;
const Muted = styled.p`color:var(--neutral-300);overflow-wrap:anywhere;`;
