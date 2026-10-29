import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { accountApi, type Account, type HourlyRatePreview, type HourlyRateRecord, type ShiftPunch, type StaffDrinkBonusReport } from "../api/account";
import TabGroup from "../components/TabGroup";
import { localeTag, type Locale } from "../i18n";
import type { StaffActivityRow } from "./staffProfileData";
import { jstInputToIso, unixSecondsToJstInput, validPunchCorrection } from "./adminPunchCorrections";
import { initialRateDraft, initialBonusDraft, validRateDraft, validBonusDraft } from "./adminTeamDrafts";

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

function bonusDateRange(rows: StaffActivityRow[], drinkLines: AdminDrinkLine[]) {
    const dates = [...new Set([...rows.map(row => row.businessDate), ...drinkLines.map(line => line.businessDate)])]
        .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
    if (!dates.length) return null;
    const dateFrom = dates[0];
    const dateTo = dates[dates.length - 1];
    const days = Math.round((Date.parse(dateTo + "T00:00:00Z") - Date.parse(dateFrom + "T00:00:00Z")) / 86400000);
    return { dateFrom, dateTo, tooWide: days > 366 };
}

/** Manager-only controls; rate and clock corrections write through audited APIs. */
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
    const [bonus, setBonus] = useState(initialBonusDraft);
    const bonusIdempotencyKey = useRef(crypto.randomUUID());
    const [rateHistory, setRateHistory] = useState<HourlyRateRecord[]>([]);
    const [rateLoading, setRateLoading] = useState(true);
    const [rateError, setRateError] = useState("");
    const [preview, setPreview] = useState<HourlyRatePreview | null>(null);
    const [previewError, setPreviewError] = useState("");
    const [previewing, setPreviewing] = useState(false);
    const [savingRate, setSavingRate] = useState(false);
    const [rateSaveError, setRateSaveError] = useState("");
    const [rateSaveSuccess, setRateSaveSuccess] = useState("");
    const [savingBonus, setSavingBonus] = useState(false);
    const [bonusSaveError, setBonusSaveError] = useState("");
    const [bonusSaveSuccess, setBonusSaveSuccess] = useState("");
    const bonusRange = useMemo(() => bonusDateRange(rows, drinkLines), [rows, drinkLines]);
    const [bonusReportState, setBonusReportState] = useState<{
        key: string;
        report: StaffDrinkBonusReport | null;
        error: string;
    } | null>(null);
    const bonusRequestKey = bonusRange ? `${person.id}:${bonusRange.dateFrom}:${bonusRange.dateTo}` : "";
    useEffect(() => {
        if (tab !== "drinks" || !bonusRange || bonusRange.tooWide) return;
        let cancelled = false;
        void accountApi.staffDrinkBonuses(person.id, bonusRange.dateFrom, bonusRange.dateTo).then(report => {
            if (!cancelled) setBonusReportState({ key: bonusRequestKey, report, error: "" });
        }).catch(error => {
            if (!cancelled) setBonusReportState({
                key: bonusRequestKey,
                report: null,
                error: error instanceof Error ? error.message : ja
                    ? "ドリンク手当を読み込めませんでした。"
                    : "Could not load the drink bonus preview.",
            });
        });
        return () => { cancelled = true; };
    }, [tab, person.id, bonusRange?.dateFrom, bonusRange?.dateTo, bonusRange?.tooWide, bonusRequestKey, ja]);
    const currentBonusReport = bonusReportState?.key === bonusRequestKey ? bonusReportState : null;

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

    async function saveBonusAdjustment() {
        if (!readyBonus || savingBonus || !bonusRange) return;
        const shiftId = Number(bonus.shiftId);
        const confirmed = window.confirm(ja
            ? "この勤務日のドリンク手当を理由付きで監査履歴に追加します。売上記録は変更しません。続行しますか？"
            : "Add this reasoned drink-bonus correction to the audit history? Original sales records will not change.");
        if (!confirmed) return;
        setSavingBonus(true);
        setBonusSaveError("");
        setBonusSaveSuccess("");
        try {
            await accountApi.createStaffDrinkBonusAdjustment(person.id, {
                shift_id: shiftId,
                signed_amount_yen: Number(bonus.adjustmentYen),
                reason: bonus.reason.trim(),
                idempotency_key: bonusIdempotencyKey.current,
            });
            const report = await accountApi.staffDrinkBonuses(
                person.id, bonusRange.dateFrom, bonusRange.dateTo,
            );
            setBonusReportState({ key: bonusRequestKey, report, error: "" });
            setBonus(initialBonusDraft);
            bonusIdempotencyKey.current = crypto.randomUUID();
            setBonusSaveSuccess(ja ? "調整を監査履歴に保存しました。" : "Adjustment saved to the audit history.");
            onRefresh();
        } catch (error) {
            setBonusSaveError(error instanceof Error ? error.message :
                (ja ? "調整を保存できませんでした。" : "Could not save the adjustment."));
        } finally {
            setSavingBonus(false);
        }
    }
    const correctablePunches = rows.flatMap(row =>
        row.status === "closed"
            ? (row.punches ?? []).filter(punch => punch.clock_out !== null).map(punch => ({ row, punch }))
            : [],
    );
    const drinkShifts = [...new Set(drinkLines.map(row => row.shiftId))];
    const readyRate = validRateDraft(rate) && Number(rate.hourlyYen) <= 10_000_000;
    const previewMatchesRate = preview?.user_id === person.id && preview.proposed_hourly_rate_yen === Number(rate.hourlyYen) && preview.effective_from === rate.effectiveFrom;
    const readyBonus = validBonusDraft(bonus, drinkShifts);

    return (
        <Area aria-label={ja ? person.name + " の管理" : "Manage " + person.name}>
            <Header>
                <div>
                    <h3>{ja ? "スタッフ設定・調整" : "Staff settings & adjustments"}</h3>
                    <p>{ja ? "時給レート・打刻修正・ドリンク手当の手動調整は監査履歴に保存。確認済みの40%ルールをプレビュー表示します。" : "Hourly rates, clock corrections and manual drink-bonus adjustments save to audit history. The confirmed 40% bonus rule is previewed from paid, linked drinks."}</p>
                </div>
                <Pill>{ja ? "時給レート管理" : "AUDITED HOURLY RATES"}</Pill>
            </Header>
            <Notice role="note">
                {ja
                    ? "時給レート・打刻修正・ドリンク手当の調整はマネージャーのみ変更でき、監査履歴に記録されます。40%手当は全額支払済みの紐づいたチケットが対象です。金額は試算で、最終給与ではありません。"
                    : "Only managers can change rates, correct clock punches or adjust drink bonuses; every change is recorded in audit history. The 40% bonus rule applies to linked drinks on fully paid tickets. Figures are estimates, not final payroll."}
            </Notice>
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
                        <p>{ja ? "本人IDに紐づいた記録のみ。表示額はドリンクの記録売価です。計算済み手当は下に表示します。" : "Line amounts are recorded listed sales; the calculated bonus is shown separately below."}</p>
                    </Intro>
                    <Card>
                        <h4>{ja ? "計算済みドリンク手当（プレビュー）" : "Calculated drink bonus preview"}</h4>
                        <p>{ja
                            ? "表示価格の40%。スタッフIDに紐づき、チケット全額の支払いが確認できたドリンクが対象です。過去の支払済み記録も含みます。"
                            : "40% of listed price for staff-ID linked drinks on fully paid tickets. Historical paid drinks are included."}</p>
                        {bonusRange === null ? (
                            <Muted>{ja ? "日付付きのドリンク記録がありません。" : "No dated drink activity is recorded."}</Muted>
                        ) : bonusRange.tooWide ? (
                            <Muted>{ja ? "期間が1年を超えています。月を選択して確認してください。" : "This range exceeds one year. Select a month to review bonuses."}</Muted>
                        ) : currentBonusReport?.error ? (
                            <Muted role="alert">{currentBonusReport.error}</Muted>
                        ) : !currentBonusReport ? (
                            <Muted role="status">{ja ? "計算中…" : "Calculating…"}</Muted>
                        ) : currentBonusReport.report ? (
                            <>
                                <Preview role="status">
                                    {ja ? "対象" : "Eligible"}: {currentBonusReport.report.totals.eligible_units} {ja ? "杯" : "drinks"}
                                    {" · "}{ja ? "対象売価" : "eligible listed price"}: ¥{currentBonusReport.report.totals.eligible_listed_revenue_yen.toLocaleString()}
                                </Preview>
                                <Records>
                                    {currentBonusReport.report.items.map((item, index) => (
                                        <Record key={item.shift_id + ":" + item.business_date + ":" + index}>
                                            <div>
                                                <strong>{dateLabel(item.business_date, locale)} · {item.eligible_units}/{item.recorded_units} {ja ? "杯が対象" : "eligible drinks"}</strong>
                                                <Muted>{ja ? "対象売価" : "Eligible listed price"}: ¥{item.eligible_listed_revenue_yen.toLocaleString()} · {ja ? "計算手当" : "calculated bonus"}: ¥{(item.calculated_bonus_yen ?? item.bonus_yen).toLocaleString()} · {ja ? "手動調整" : "manual adjustment"}: ¥{(item.manual_adjustment_yen ?? 0).toLocaleString()} · {ja ? "合計" : "total"}: ¥{item.bonus_yen.toLocaleString()}</Muted>
                                            </div>
                                        </Record>
                                    ))}
                                </Records>
                                <Muted>{ja ? "計算手当" : "Calculated bonus"}: ¥{(currentBonusReport.report.totals.calculated_bonus_yen ?? currentBonusReport.report.totals.bonus_yen).toLocaleString()}
                                    {" · "}{ja ? "手動調整" : "Manual adjustments"}: ¥{(currentBonusReport.report.totals.manual_adjustment_yen ?? 0).toLocaleString()}
                                    {" · "}{ja ? "調整後の合計（プレビュー）" : "Adjusted total (preview)"}: ¥{currentBonusReport.report.totals.bonus_yen.toLocaleString()}</Muted>
                                {currentBonusReport.report.adjustments?.length ? (
                                    <Records aria-label={ja ? "手当調整履歴" : "Bonus adjustment history"}>
                                        {currentBonusReport.report.adjustments.map(adjustment => (
                                            <Record key={adjustment.id}>
                                                <div>
                                                    <strong>{dateLabel(adjustment.business_date, locale)} · {adjustment.signed_amount_yen >= 0 ? "+" : "−"}¥{Math.abs(adjustment.signed_amount_yen).toLocaleString()}</strong>
                                                    <Muted>{adjustment.reason} · {ja ? "記録者" : "Recorded by"}: {adjustment.created_by_name}
                                                        {adjustment.reversal_of_id ? ` · ${ja ? "取消" : "reversal"} #${adjustment.reversal_of_id}` : ""}</Muted>
                                                </div>
                                            </Record>
                                        ))}
                                    </Records>
                                ) : null}
                            </>
                        ) : null}
                    </Card>
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
                        <h4>{ja ? "ドリンク手当の調整" : "Manual drink-bonus adjustment"}</h4>
                        <p>{ja ? "理由付きの調整を追加します。スタッフドリンクやチケットの販売記録は変更しません。" : "Append a reasoned adjustment. Original staff-drink and ticket sales records remain unchanged."}</p>
                        <Fields>
                            <label>{ja ? "対象シフト" : "Shift with recorded drinks"}
                                <select disabled={savingBonus} value={bonus.shiftId} onChange={e => { bonusIdempotencyKey.current = crypto.randomUUID(); setBonus({ ...bonus, shiftId: e.target.value }); }}>
                                    <option value="">{ja ? "選択してください" : "Select shift"}</option>
                                    {drinkShifts.map(id => {
                                        const line = drinkLines.find(item => item.shiftId === id);
                                        return <option key={id} value={id}>{line ? dateLabel(line.businessDate, locale) : id}</option>;
                                    })}
                                </select>
                            </label>
                            <label>{ja ? "調整額（円、マイナス可）" : "Adjustment (JPY, negative allowed)"}
                                <input disabled={savingBonus} type="number" step="1" value={bonus.adjustmentYen}
                                    onChange={e => { bonusIdempotencyKey.current = crypto.randomUUID(); setBonus({ ...bonus, adjustmentYen: e.target.value }); }} />
                            </label>
                            <label>{ja ? "調整理由（必須）" : "Adjustment reason (required)"}
                                <textarea disabled={savingBonus} rows={3} maxLength={500} value={bonus.reason}
                                    onChange={e => { bonusIdempotencyKey.current = crypto.randomUUID(); setBonus({ ...bonus, reason: e.target.value }); }} />
                            </label>
                        </Fields>
                        {readyBonus ? <Preview role="status">
                            {ja ? "調整プレビュー" : "Adjustment preview"}: {Number(bonus.adjustmentYen) >= 0 ? "+" : "−"}¥{Math.abs(Number(bonus.adjustmentYen)).toLocaleString()}
                        </Preview> : <Help>{ja ? "対象シフト・0以外の整数の円金額・理由を入力してください。" : "Choose a shift, a nonzero whole-yen adjustment and a reason."}</Help>}
                        {bonusSaveError ? <p role="alert">{bonusSaveError}</p> : null}
                        {bonusSaveSuccess ? <p role="status">{bonusSaveSuccess}</p> : null}
                        <Actions>
                            <button type="button" className="hollow secondary" disabled={savingBonus}
                                onClick={() => { bonusIdempotencyKey.current = crypto.randomUUID(); setBonus(initialBonusDraft); setBonusSaveError(""); setBonusSaveSuccess(""); }}>
                                {ja ? "クリア" : "Clear draft"}
                            </button>
                            <button type="button" disabled={!readyBonus || savingBonus || !currentBonusReport?.report}
                                onClick={() => void saveBonusAdjustment()}>
                                {savingBonus ? (ja ? "保存中…" : "Saving…") : (ja ? "調整を保存" : "Save adjustment")}
                            </button>
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
