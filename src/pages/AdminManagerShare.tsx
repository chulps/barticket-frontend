import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { accountApi, type Account, type RevenueSharePreview, type ShiftReport } from "../api/account";
import { localeTag, type Locale } from "../i18n";
import {
    DEFAULT_SHARE_POLICY, distinctShareShifts, shareBrackets, shareMonths,
} from "./managerRevenueShare";

type Props = {
    person: Account;
    locale: Locale;
    shifts: ShiftReport[];
    managers: Account[];
    onRefresh: () => void;
    refreshVersion: number;
};

function yen(value: number, locale: Locale): string {
    return "¥" + value.toLocaleString(localeTag(locale));
}
function dateLabel(value: string, locale: Locale): string {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(localeTag(locale), {
        month: "short", day: "numeric", weekday: "short",
    });
}
function monthLabel(value: string, locale: Locale): string {
    const [y, m] = value.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(localeTag(locale), {
        month: "long", year: "numeric",
    });
}

function blockerLabel(code: string, ja: boolean): string {
    const labels: Record<string, [string, string]> = {
        no_recorded_shifts: ["記録済みシフトがありません", "No shifts are recorded for this month"],
        working_manager_unassigned: ["担当マネージャー未確認のシフトがあります", "Some shifts have no confirmed working manager"],
        working_manager_shift_open: ["Chuck担当のシフトが営業中です", "A shift assigned to Chuck as working manager is still open"],
        revenue_definition_pending: ["歩合計算に使う売上の範囲が未確認です", "The sales included in the share calculation are unconfirmed"],
        gross_share_rounding_pending: ["1円未満の計算方法が未確認です", "The yen rounding rule for gross share is unconfirmed"],
        staff_payroll_costs_unavailable: ["スタッフ人件費を確認できません", "Staff payroll costs are unavailable"],
        adjustments_unavailable: ["控除・加算額を確認できません", "Deductions and additions are unavailable"],
        invalid_revenue: ["売上データに問題があります", "Revenue data is invalid"],
    };
    const label = labels[code];
    return label ? label[ja ? 0 : 1] : code;
}

/** Preview only: final payable is unavailable until cost data is verified. */
export default function AdminManagerShare({ person, locale, shifts, managers, onRefresh, refreshVersion }: Props) {
    const ja = locale === "ja";
    const allShifts = useMemo(() => distinctShareShifts(shifts), [shifts]);
    const months = useMemo(() => shareMonths(allShifts), [allShifts]);
    const [month, setMonth] = useState("");
    const selectedMonth = months.includes(month) ? month : months[0] ?? "";
    const [showTiers, setShowTiers] = useState(false);
    const [managerDrafts, setManagerDrafts] = useState<Record<number, { managerId: string; reason: string }>>({});
    const [savingManagerId, setSavingManagerId] = useState<number | null>(null);
    const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<number>>(() => new Set());
    const [managerHistory, setManagerHistory] = useState<Record<number, Awaited<ReturnType<typeof accountApi.workingManagerHistory>>>>({});
    const [loadingHistoryId, setLoadingHistoryId] = useState<number | null>(null);
    const [assignmentError, setAssignmentError] = useState("");
    const [sharePreviewState, setSharePreviewState] = useState<{
        requestKey: string;
        preview: RevenueSharePreview | null;
        error: string;
    } | null>(null);

    useEffect(() => {
        if (!selectedMonth) return;
        let cancelled = false;
        const requestKey = `${selectedMonth}:${refreshVersion}:${ja ? "ja" : "en"}`;
        void accountApi.revenueSharePreview(selectedMonth).then(result => {
            if (!cancelled) setSharePreviewState({ requestKey, preview: result, error: "" });
        }).catch(error => {
            if (!cancelled) {
                setSharePreviewState({
                    requestKey,
                    preview: null,
                    error: error instanceof Error ? error.message
                        : ja ? "歩合給の試算を読み込めませんでした。" : "Could not load the revenue-share preview.",
                });
            }
        });
        return () => { cancelled = true; };
    }, [selectedMonth, refreshVersion, ja]);

    const requestKey = selectedMonth ? `${selectedMonth}:${refreshVersion}:${ja ? "ja" : "en"}` : "";
    const currentPreviewState = sharePreviewState?.requestKey === requestKey ? sharePreviewState : null;
    const sharePreview = currentPreviewState?.preview ?? null;
    const sharePreviewLoading = Boolean(selectedMonth && !currentPreviewState);
    const sharePreviewError = currentPreviewState?.error ?? "";
    const previewForMonth = sharePreview?.month === selectedMonth ? sharePreview : null;
    const monthShifts = useMemo(() => allShifts.filter(shift =>
        shift.business_date.startsWith(selectedMonth),
    ), [allShifts, selectedMonth]);
    const workingManagerShiftIds = useMemo(() => new Set(previewForMonth?.working_manager_shift_ids ?? []), [previewForMonth]);
    const scenario = {
        selected: monthShifts.filter(shift => workingManagerShiftIds.has(shift.id)),
        eligibleRevenue: previewForMonth?.eligible_revenue_yen ?? null,
        knownRevenue: previewForMonth?.working_manager_revenue_known_yen ?? null,
        selectedOpen: previewForMonth?.open_working_manager_shift_ids.length ?? 0,
        unverifiedRevenue: previewForMonth?.unassigned_shift_ids.length ?? 0,
        tierRate: previewForMonth?.tier_rate_percent ?? null,
        next: previewForMonth?.next_tier ? {
            rate: previewForMonth.next_tier.rate_percent,
            atYen: previewForMonth.next_tier.threshold_yen,
            remainingYen: previewForMonth.next_tier.remaining_yen,
        } : null,
    };
    const grossShare = previewForMonth?.gross_share_yen ?? null;
    const brackets = shareBrackets(DEFAULT_SHARE_POLICY);
    const capThreshold = brackets[brackets.length - 1]?.from ?? 0;
    const progressTarget = scenario.next?.atYen ?? capThreshold;
    const progress = Math.max(0, Math.min(100,
        progressTarget > 0 ? (scenario.knownRevenue ?? 0) / progressTarget * 100 : 0));

    function selectMonth(value: string) {
        setMonth(value);
    }
    async function saveWorkingManager(shift: Pick<ShiftReport, "id">) {
        const draft = managerDrafts[shift.id];
        if (!draft || !draft.reason.trim()) return;
        setSavingManagerId(shift.id);
        setAssignmentError("");
        try {
            await accountApi.assignWorkingManager(
                shift.id,
                draft.managerId ? Number(draft.managerId) : null,
                draft.reason,
            );
            setManagerDrafts(previous => {
                const next = { ...previous };
                delete next[shift.id];
                return next;
            });
            setManagerHistory(previous => {
                const next = { ...previous };
                delete next[shift.id];
                return next;
            });
            setExpandedHistoryIds(previous => {
                const next = new Set(previous);
                next.delete(shift.id);
                return next;
            });
            onRefresh();
        } catch (error) {
            setAssignmentError(error instanceof Error ? error.message
                : ja ? "担当マネージャーを保存できませんでした。" : "Could not save the working-manager assignment.");
        } finally {
            setSavingManagerId(null);
        }
    }
    async function toggleWorkingManagerHistory(shiftId: number) {
        if (expandedHistoryIds.has(shiftId)) {
            setExpandedHistoryIds(previous => {
                const next = new Set(previous);
                next.delete(shiftId);
                return next;
            });
            return;
        }
        setExpandedHistoryIds(previous => new Set(previous).add(shiftId));
        if (managerHistory[shiftId]) return;
        setLoadingHistoryId(shiftId);
        setAssignmentError("");
        try {
            const history = await accountApi.workingManagerHistory(shiftId);
            setManagerHistory(previous => ({ ...previous, [shiftId]: history }));
        } catch (error) {
            setAssignmentError(error instanceof Error ? error.message
                : ja ? "担当履歴を読み込めませんでした。" : "Could not load manager-assignment history.");
        } finally {
            setLoadingHistoryId(null);
        }
    }
    return (
        <Root aria-label={ja ? "マネージャー歩合給試算" : "Manager revenue-share preview"}>
            <Top>
                <div>
                    <Eyebrow>{ja ? "マネージャー歩合給" : "MANAGER REVENUE SHARE"}</Eyebrow>
                    <h4>{ja ? "月間歩合給プランナー" : "Monthly revenue-share planner"}</h4>
                    <Muted>{ja ? person.name + " の給与ルール案" : "Provisional rule for " + person.name}</Muted>
                </div>
                <Flag>{ja ? "試算・未保存" : "PREVIEW ONLY"}</Flag>
            </Top>
            <Notice role="note">{ja
                ? "これは給与明細ではありません。記録されたシフト割当を確認できますが、歩合給の計算方法はまだ確定していません。"
                : "This is a preview, not a payslip. Recorded shift assignments are shown for review; the payout calculation is not confirmed."}</Notice>

            <Card>
                <h5>{ja ? "1. 確認済みの歩合率" : "1. Confirmed revenue-share tiers"}</h5>
                <Muted>{ja
                    ? "料率と売上の段階を表示します。売上に対する料率の適用方法は、ご説明をいただくまで保留します。"
                    : "The rate tiers are shown below. How the selected rate applies to revenue remains pending your explanation."}</Muted>
                <Tiny>{ja
                    ? "歩合率：40%から開始し、50万円で41%。以後5万円ごとに1ポイント上がり、145万円で60%に達します。"
                    : "Rates start at 40%, reach 41% at ¥500,000, then rise by 1 point per ¥50,000 to the 60% cap at ¥1,450,000."}</Tiny>
            </Card>
            <Card>
                <CardHeader>
                    <div>
                        <h5>{ja ? "2. 対象月と担当シフト" : "2. Month and qualifying shifts"}</h5>
                        <Muted>{ja
                            ? "担当マネージャーとして記録されたシフトだけを対象にします。開店担当者名からは判定しません。"
                            : "Only shifts with an explicit working-manager assignment qualify. The opener's name is not used to infer eligibility."}</Muted>
                    </div>
                    <select aria-label={ja ? "対象月" : "Revenue-share month"}
                        value={selectedMonth} disabled={!months.length}
                        onChange={event => selectMonth(event.target.value)}>
                        {months.length ? months.map(item => (
                            <option key={item} value={item}>{monthLabel(item, locale)}</option>
                        )) : <option value="">{ja ? "記録なし" : "No recorded months"}</option>}
                    </select>
                </CardHeader>
                {monthShifts.length ? (
                    <ShiftList>
                        {monthShifts.map(shift => (
                            <ShiftOption key={shift.id}>
                                <ShiftText>
                                    <strong>{dateLabel(shift.business_date, locale)} · #{shift.id}</strong>
                                    <Muted>{ja ? "開店記録" : "Opened by"}: {shift.opened_by || "—"} · {ja ? "担当マネージャー" : "Working manager"}: {shift.working_manager_name || (ja ? "未設定" : "Unassigned")} · {shift.status === "open"
                                        ? (ja ? "営業中" : "Open / provisional")
                                        : (ja ? "終了" : "Closed")}</Muted>
                                    <AssignmentFields>
                                        <label>{ja ? "担当マネージャー" : "Designated working manager"}
                                            <select
                                                aria-label={(ja ? "担当マネージャーを選択 " : "Choose working manager for ") + dateLabel(shift.business_date, locale)}
                                                value={managerDrafts[shift.id]?.managerId ?? (shift.working_manager_user_id ? String(shift.working_manager_user_id) : "")}
                                                onChange={event => setManagerDrafts(previous => ({
                                                    ...previous,
                                                    [shift.id]: {
                                                        managerId: event.target.value,
                                                        reason: previous[shift.id]?.reason ?? "",
                                                    },
                                                }))}>
                                                <option value="">{ja ? "未割当" : "Unassigned"}</option>
                                                {managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
                                            </select>
                                        </label>
                                        <label>{ja ? "変更理由" : "Reason for assignment or correction"}
                                            <input
                                                maxLength={500}
                                                value={managerDrafts[shift.id]?.reason ?? ""}
                                                onChange={event => setManagerDrafts(previous => ({
                                                    ...previous,
                                                    [shift.id]: {
                                                        managerId: previous[shift.id]?.managerId ?? (shift.working_manager_user_id ? String(shift.working_manager_user_id) : ""),
                                                        reason: event.target.value,
                                                    },
                                                }))}
                                            />
                                        </label>
                                        <button type="button" className="small hollow secondary"
                                            disabled={savingManagerId === shift.id || !managerDrafts[shift.id]?.reason.trim() ||
                                                (managerDrafts[shift.id]?.managerId ?? (shift.working_manager_user_id ? String(shift.working_manager_user_id) : "")) === (shift.working_manager_user_id ? String(shift.working_manager_user_id) : "")}
                                            onClick={() => void saveWorkingManager(shift)}>
                                            {savingManagerId === shift.id ? (ja ? "保存中…" : "Saving…") : (ja ? "担当を保存" : "Save assignment")}
                                        </button>
                                    </AssignmentFields>
                                    <button type="button" className="small hollow secondary"
                                        aria-expanded={expandedHistoryIds.has(shift.id)}
                                        onClick={() => void toggleWorkingManagerHistory(shift.id)}>
                                        {loadingHistoryId === shift.id ? (ja ? "読み込み中…" : "Loading history…")
                                            : expandedHistoryIds.has(shift.id)
                                                ? (ja ? "担当履歴を閉じる" : "Hide assignment history")
                                                : (ja ? "担当変更履歴を見る" : "View assignment history")}
                                    </button>
                                    {expandedHistoryIds.has(shift.id) && managerHistory[shift.id] ? (
                                        managerHistory[shift.id].length ? (
                                            <ul>{managerHistory[shift.id].map(event => (
                                                <li key={event.id}>
                                                    {new Date(event.changed_at * 1000).toLocaleString(localeTag(locale))}: {event.previous_manager_name || (ja ? "未割当" : "Unassigned")}
                                                    {" → "}{event.new_manager_name || (ja ? "未割当" : "Unassigned")} · {event.changed_by}: {event.reason}
                                                </li>
                                            ))}</ul>
                                        ) : <Tiny>{ja ? "変更履歴はありません。" : "No assignment changes recorded."}</Tiny>
                                    ) : null}
                                </ShiftText>
                                <Money>{Number.isSafeInteger(shift.paid_total) && shift.paid_total >= 0
                                    ? yen(shift.paid_total, locale) : "—"}</Money>
                            </ShiftOption>
                        ))}
                    </ShiftList>
                ) : <Muted>{ja ? "シフトがありません。" : "No recorded shifts in this month."}</Muted>}
                {assignmentError ? <Notice role="alert">{assignmentError}</Notice> : null}
                <Tiny>{ja
                    ? "選択したシフトの paid_total（受領済み売上）のみを仮計算に使用。最終的な売上定義は未確定です。"
                    : "This provisional scenario uses paid_total from selected shift reports only. The final revenue definition is not approved."}</Tiny>
            </Card>

            <Card>
                <h5>{ja ? "3. 月間売上とレート" : "3. Monthly qualifying revenue and tiers"}</h5>
                <Metrics>
                    <Metric><span>{ja ? "Chuck担当の終了シフト" : "Closed shifts assigned to Chuck"}</span><strong>{scenario.selected.length}</strong></Metric>
                    <Metric><span>{ja ? "Chuck担当シフトの記録売上（確認用）" : "Recorded revenue on Chuck-managed shifts (review only)"}</span>
                        <strong>{scenario.knownRevenue === null ? "—" : yen(scenario.knownRevenue, locale)}</strong>
                    </Metric>
                    <Metric><span>{ja ? "今月の歩合率（仮）" : "Monthly rate (preview)"}</span>
                        <strong>{scenario.tierRate === null ? "—" : scenario.tierRate + "%"}</strong>
                    </Metric>
                    <Metric><span>{ja ? "次のレート" : "Next tier"}</span>
                        <strong>{scenario.next
                            ? scenario.next.rate + "% · " + yen(scenario.next.remainingYen, locale)
                            : scenario.tierRate === DEFAULT_SHARE_POLICY.capRate
                                ? (ja ? `上限 ${DEFAULT_SHARE_POLICY.capRate}%（確認済み）` : `Confirmed cap: ${DEFAULT_SHARE_POLICY.capRate}%`)
                                : "—"}</strong>
                    </Metric>
                </Metrics>
                {scenario.tierRate !== null && scenario.knownRevenue !== null ? (
                    <div>
                        <Bar role="progressbar" aria-label={ja ? "次の歩合率まで" : "Progress to next tier"}
                            aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                            <Fill $value={progress} />
                        </Bar>
                        <Tiny>{scenario.next
                            ? (ja ? "次の条件 " : "Next threshold: ") + yen(scenario.next.atYen, locale)
                            : (ja ? `確認済み上限：${DEFAULT_SHARE_POLICY.capRate}%` : `Confirmed rate ceiling: ${DEFAULT_SHARE_POLICY.capRate}%`)}</Tiny>
                    </div>
                ) : <Muted>{sharePreviewLoading
                    ? (ja ? "試算を読み込み中…" : "Loading preview…")
                    : sharePreviewError ? sharePreviewError
                        : ja ? "担当シフトの売上に基づくレートのプレビューです。未収分はサービス提供月に一度だけ計上します。" : "This rate preview uses sales from Chuck-managed shifts. Unpaid tickets count once in the service month."}</Muted>}
                {sharePreviewLoading ? <Tiny role="status">{ja ? "サーバーから試算を読み込み中…" : "Loading server preview…"}</Tiny> : null}
                {scenario.selectedOpen > 0 ? <Notice role="note">{ja
                    ? "Chuck担当として記録された営業中のシフトがあります。"
                    : "A shift assigned to Chuck as working manager is still open."}</Notice> : null}
                {scenario.unverifiedRevenue ? <Notice role="note">{ja
                    ? `担当マネージャー未確認のシフトが${scenario.unverifiedRevenue}件あります。担当シフトの記録売上は確認用です：${yen(scenario.knownRevenue ?? 0, locale)}`
                    : `${scenario.unverifiedRevenue} shift(s) lack a confirmed working manager. Recorded revenue for Chuck-managed shifts is review-only: ${yen(scenario.knownRevenue ?? 0, locale)}.`}</Notice> : null}
                <button type="button" className="small hollow secondary"
                    aria-expanded={showTiers} onClick={() => setShowTiers(value => !value)}>
                    {showTiers ? (ja ? "レート表を閉じる" : "Hide tier schedule")
                        : (ja ? "レート表を見る" : "View tier schedule")}
                </button>
                {showTiers ? (
                    <TierScroll>
                        <TierTable>
                            <thead><tr>
                                <th>{ja ? "担当シフトの月間売上段階（プレビュー）" : "Monthly tiers for Chuck-managed shifts (preview)"}</th>
                                <th>{ja ? "レート" : "Rate"}</th>
                            </tr></thead>
                            <tbody>{brackets.map(tier => (
                                <tr key={tier.rate} aria-current={scenario.tierRate === tier.rate ? "true" : undefined}>
                                    <td>{yen(tier.from, locale)}{tier.to === null
                                        ? " +"
                                        : " – " + yen(tier.to, locale)}</td>
                                    <td>{tier.rate}%{tier.rate === DEFAULT_SHARE_POLICY.capRate ? (ja ? "（確認済み上限）" : " (confirmed cap)") : ""}</td>
                                </tr>
                            ))}</tbody>
                        </TierTable>
                    </TierScroll>
                ) : null}
            </Card>

            <Card>
                <h5>{ja ? "4. 歩合給の試算" : "4. Revenue-share calculation"}</h5>
                {sharePreviewError ? <Notice role="alert">{sharePreviewError}</Notice> : null}
                {previewForMonth?.blockers.length ? <Notice role="note">{ja
                    ? "未確定項目：" + previewForMonth.blockers.map(code => blockerLabel(code, true)).join("、")
                    : "Preview blockers: " + previewForMonth.blockers.map(code => blockerLabel(code, false)).join(", ")}</Notice> : null}
                <Metrics>
                    <Metric><span>{ja ? "総歩合給プレビュー（費用控除前）" : "Gross share preview (before costs)"}</span>
                        <strong>{grossShare === null ? "—" : yen(grossShare, locale)}</strong></Metric>
                    <Metric><span>{ja ? "最終支給額" : "Final payable"}</span>
                        <strong>{previewForMonth?.payable_yen == null ? "—" : yen(previewForMonth.payable_yen, locale)}</strong></Metric>
                </Metrics>
                <Tiny>{ja
                    ? "確認済み：到達した月間料率を対象売上全体に適用し、未収チケットはサービス月に一度だけ計上します。歩合給プレビューは1円単位で四捨五入します。最終支給額は人件費、ドリンクバック、控除・加算の確認後に表示されます。"
                    : "Confirmed: the reached monthly rate applies to all qualifying monthly sales. Unpaid tickets count once in the service month, and the gross-share preview rounds to the nearest yen. Final pay remains unavailable until staff costs, drinkback, deductions and additions are verified."}</Tiny>
            </Card>

            <Card>
                <h5>{ja ? "5. 給与明細の内訳" : "5. Pay statement details"}</h5>
                <Muted>{ja
                    ? "既知の人件費とその他の調整額をAPIが返すまで、この内訳は利用できません。空欄や欠落データは0円として扱いません。"
                    : "This breakdown remains unavailable until verified staff costs and adjustments are available from the API. Blank or missing data never counts as ¥0."}</Muted>
                <Metrics>
                    <Metric><span>{ja ? "スタッフ基本給" : "Staff base wages"}</span><strong>—</strong></Metric>
                    <Metric><span>{ja ? "スタッフドリンクバック" : "Staff drinkback"}</span><strong>—</strong></Metric>
                    <Metric><span>{ja ? "控除・加算" : "Deductions and additions"}</span><strong>—</strong></Metric>
                    <Metric><span>{ja ? "差引額" : "Net payable"}</span><strong>—</strong></Metric>
                </Metrics>
            </Card>
            <Footnote>{ja
                ? "この画面はChuckさんのプロフィールでのみ表示されます。閲覧対象はChuckさんとNoriさんの管理者アカウントだけです。ユーザーIDのフロントエンド判定はデータ保護の代わりにはならず、給与の保存・公開にはバックエンドの権限確認が必要です。"
                : "Visible only on Chuck's Admin profile to the configured Chuck and Nori manager accounts. Frontend ID checks do not replace server-side authorization. Real private compensation reads and writes require backend permissions."}</Footnote>
        </Root>
    );
}

const Root = styled.section`display:flex;flex-direction:column;gap:var(--space-2);min-width:0;`;
const Top = styled.div`
    display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-2);flex-wrap:wrap;
    h4{font-size:var(--font-size-h4);font-weight:600;}
`;
const Eyebrow = styled.p`font-size:var(--font-size-small);letter-spacing:0.06em;color:var(--neutral-300);`;
const Flag = styled.span`
    border:1px solid var(--neutral-500);border-radius:999px;padding:6px 10px;
    font-size:var(--font-size-small);white-space:nowrap;color:var(--neutral-200);
`;
const Notice = styled.p`
    border:1px solid var(--neutral-600);border-radius:8px;padding:var(--space-1);
    font-size:var(--font-size-small);line-height:1.55;
`;
const Card = styled.section`
    background:var(--neutral-900);padding:var(--space-2);border-radius:12px;
    display:flex;flex-direction:column;gap:var(--space-1);min-width:0;
    h5{font-weight:600;}
    select{background:var(--dark);max-width:100%;min-width:0;}
    button{width:auto;align-self:flex-start;}
    button:disabled{opacity:.55;cursor:not-allowed;}
`;
const CardHeader = styled.div`
    display:flex;align-items:start;justify-content:space-between;flex-wrap:wrap;gap:var(--space-1);
`;
const ShiftList = styled.div`display:flex;flex-direction:column;`;
const ShiftOption = styled.div`
    display:flex;gap:var(--space-1);align-items:flex-start;min-width:0;padding:var(--space-1) 0;
    border-bottom:1px solid var(--neutral-700);
    @media(max-width:540px){flex-direction:column;}
`;
const ShiftText = styled.div`display:flex;flex-direction:column;gap:var(--space-1);flex:1;min-width:0;strong{font-weight:500;}`;
const AssignmentFields = styled.div`
    display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-1);align-items:end;
    label{display:flex;flex-direction:column;gap:4px;font-size:var(--font-size-small);}
    input,select{width:100%;min-width:0;}
    button{grid-column:1 / -1;}
    @media(max-width:540px){grid-template-columns:1fr;button{grid-column:auto;}}
`;
const Money = styled.span`white-space:nowrap;font-family:var(--font-family-data);`;
const Metrics = styled.div`
    display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:var(--space-1);
    @media(min-width:500px){grid-template-columns:repeat(2,minmax(0,1fr));}
    @media(min-width:1100px){grid-template-columns:repeat(4,minmax(0,1fr));}
`;
const Metric = styled.div`
    background:var(--neutral-800);padding:var(--space-1);border-radius:8px;min-width:0;
    display:flex;flex-direction:column;gap:4px;
    span{color:var(--neutral-300);font-size:var(--font-size-small);}
    strong{font-family:var(--font-family-data);font-size:var(--font-size-h4);overflow-wrap:anywhere;}
`;
const Bar = styled.div`
    width:100%;height:10px;border-radius:999px;background:var(--neutral-700);overflow:hidden;
`;
const Fill = styled.div<{ $value: number }>`
    height:100%;width:${props => props.$value}%;border-radius:inherit;background:var(--neutral-200);
`;
const TierScroll = styled.div`max-height:360px;overflow:auto;max-width:100%;`;
const TierTable = styled.table`
    width:100%;border-collapse:collapse;text-align:left;
    th,td{padding:8px;border-bottom:1px solid var(--neutral-700);}
    th:last-child,td:last-child{text-align:right;}
    tr[aria-current="true"]{background:var(--neutral-700);}
`;
const Muted = styled.p`color:var(--neutral-300);line-height:1.5;overflow-wrap:anywhere;`;
const Tiny = styled.p`color:var(--neutral-300);font-size:var(--font-size-small);line-height:1.5;`;
const Footnote = styled.p`color:var(--neutral-300);font-size:var(--font-size-small);line-height:1.6;`;
