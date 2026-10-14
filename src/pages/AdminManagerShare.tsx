import { useMemo, useState } from "react";
import styled from "styled-components";
import type { Account, ShiftReport } from "../api/account";
import { localeTag, type Locale } from "../i18n";
import {
    blankShareCosts, distinctShareShifts, flatShareScenario, marginalShareScenario,
    netShareScenario, parseDraftYen, shareBrackets, shareMonths, shareSelection,
    defaultSharePolicyDraft, parseSharePolicy,
    type DraftShareCosts, type SharePolicyDraft,
} from "./managerRevenueShare";

type Props = { person: Account; locale: Locale; shifts: ShiftReport[] };

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

/** Preview only: neither eligibility nor salary is verified by the current API. */
export default function AdminManagerShare({ person, locale, shifts }: Props) {
    const ja = locale === "ja";
    const allShifts = useMemo(() => distinctShareShifts(shifts), [shifts]);
    const months = useMemo(() => shareMonths(allShifts), [allShifts]);
    const [month, setMonth] = useState("");
    const selectedMonth = months.includes(month) ? month : months[0] ?? "";
    const [eligibleIds, setEligibleIds] = useState<Set<number>>(() => new Set());
    const [costs, setCosts] = useState<DraftShareCosts>(() => ({ ...blankShareCosts }));
    const [policyDraft, setPolicyDraft] = useState<SharePolicyDraft>(() => ({ ...defaultSharePolicyDraft }));
    const policy = useMemo(() => parseSharePolicy(policyDraft), [policyDraft]);
    const [showTiers, setShowTiers] = useState(false);

    const monthShifts = useMemo(() => allShifts.filter(shift =>
        shift.business_date.startsWith(selectedMonth),
    ), [allShifts, selectedMonth]);
    const scenario = useMemo(() => shareSelection(monthShifts, selectedMonth, eligibleIds, policy),
        [monthShifts, selectedMonth, eligibleIds, policy]);
    const flat = policy ? flatShareScenario(scenario.eligibleRevenue, policy) : null;
    const marginal = policy ? marginalShareScenario(scenario.eligibleRevenue, policy) : null;
    const flatNet = netShareScenario(flat, costs);
    const marginalNet = netShareScenario(marginal, costs);
    const hasCosts = Object.values(costs).every(value => parseDraftYen(value) !== null);
    const brackets = policy ? shareBrackets(policy) : [];
    const capThreshold = brackets[brackets.length - 1]?.from ?? 0;
    const progressTarget = scenario.next?.atYen ?? capThreshold;
    const progress = Math.max(0, Math.min(100,
        progressTarget > 0 ? (scenario.eligibleRevenue ?? 0) / progressTarget * 100 : 0));

    function selectMonth(value: string) {
        setMonth(value);
        setEligibleIds(new Set());
        setCosts({ ...blankShareCosts });
    }
    function toggleEligible(id: number) {
        setEligibleIds(previous => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }
    function reset() {
        setEligibleIds(new Set());
        setCosts({ ...blankShareCosts });
        setPolicyDraft({ ...defaultSharePolicyDraft });
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
                ? "これは給与明細ではありません。バックエンドに歩合給ルールや正式な担当マネージャー情報はまだありません。対象シフトを手動選択し、仮の売上と計算例を確認できます。選択・入力は保存されません。"
                : "Not a payslip. The API does not yet provide a revenue-share plan or verified shift-manager assignments. Manually select candidate shifts for a temporary scenario. Nothing is saved or used for payroll."}</Notice>

            <Card>
                <h5>{ja ? "1. 歩合給ルールの編集案" : "1. Adjust revenue-share rule (unsaved draft)"}</h5>
                <Muted>{ja
                    ? "ChuckさんとNoriさんだけがこの編集画面を利用できます。これらの条件は試算用で、サーバーには保存されません。"
                    : "Chuck and Nori can adjust this proposed policy here. Changes affect the local preview only and are NOT saved to the server."}</Muted>
                <CostFields>
                    {([
                        ["baseRate", ja ? "開始歩合率（%）" : "Starting share (%)"],
                        ["firstThresholdYen", ja ? "最初の昇格売上（円）" : "First tier threshold (JPY)"],
                        ["stepYen", ja ? "昇格ごとの売上幅（円）" : "Revenue per tier step (JPY)"],
                        ["incrementPoints", ja ? "1段階の上昇率（%）" : "Increase per step (percentage points)"],
                        ["capRate", ja ? "歩合率の上限（%・暫定）" : "Maximum share (% — proposed cap)"],
                    ] as const).map(([key, label]) => (
                        <label key={key}>{label}
                            <input type="number" min={key === "baseRate" ? "0" : "1"}
                                max={key === "firstThresholdYen" || key === "stepYen" ? "1000000000" : "100"}
                                step="1" value={policyDraft[key]}
                                onChange={event => setPolicyDraft(previous => ({
                                    ...previous, [key]: event.target.value,
                                }))} />
                        </label>
                    ))}
                </CostFields>
                {policy ? <Tiny role="status">{ja
                    ? `試算ルール：${policy.baseRate}%から開始、${yen(policy.firstThresholdYen, locale)}で初回昇格、以後${yen(policy.stepYen, locale)}ごとに+${policy.incrementPoints}ポイント。上限${policy.capRate}%（すべて未保存）。`
                    : `Draft: start at ${policy.baseRate}%, first increase at ${yen(policy.firstThresholdYen, locale)}, then +${policy.incrementPoints} points per ${yen(policy.stepYen, locale)}, up to ${policy.capRate}%. Not saved.`}</Tiny>
                    : <Notice role="alert">{ja ? "有効な数値を入力してください。上限は開始率以上、最大100%です。" : "Enter valid whole numbers. The cap must be at least the starting rate and no greater than 100%."}</Notice>}
                <Actions>
                    <button type="button" className="small hollow secondary"
                        onClick={() => setPolicyDraft({ ...defaultSharePolicyDraft })}>
                        {ja ? "40〜60%の初期案に戻す" : "Restore proposed 40–60% tiers"}
                    </button>
                    <button type="button" disabled>{ja ? "ルールを保存（未対応）" : "Save pay rule — unavailable"}</button>
                </Actions>
            </Card>
            <Card>
                <CardHeader>
                    <div>
                        <h5>{ja ? "2. 対象月と担当シフト" : "2. Month and qualifying shifts"}</h5>
                        <Muted>{ja
                            ? "Chuckさんが実際にマネージャーを担当した夜だけを選択。Noriさんの夜は含めないでください。"
                            : "Select only nights when Chuck was the designated manager. Exclude Nori's shifts. This is not an official assignment."}</Muted>
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
                                <input type="checkbox" checked={eligibleIds.has(shift.id)}
                                    aria-label={(ja ? "担当マネージャーだったシフト " : "I confirm Chuck managed this shift: ") + dateLabel(shift.business_date, locale)}
                                    onChange={() => toggleEligible(shift.id)} />
                                <ShiftText>
                                    <strong>{dateLabel(shift.business_date, locale)} · #{shift.id}</strong>
                                    <Muted>{ja ? "開店記録" : "Opened by"}: {shift.opened_by || "—"} · {shift.status === "open"
                                        ? (ja ? "営業中" : "Open / provisional")
                                        : (ja ? "終了" : "Closed")}</Muted>
                                    <Tiny>{ja ? "「開店記録」はマネージャー担当の証明ではありません。" : "The person who opened a shift may not be its designated manager."}</Tiny>
                                </ShiftText>
                                <Money>{Number.isSafeInteger(shift.paid_total) && shift.paid_total >= 0
                                    ? yen(shift.paid_total, locale) : "—"}</Money>
                            </ShiftOption>
                        ))}
                    </ShiftList>
                ) : <Muted>{ja ? "シフトがありません。" : "No recorded shifts in this month."}</Muted>}
                <Tiny>{ja
                    ? "選択したシフトの paid_total（受領済み売上）のみを仮計算に使用。最終的な売上定義は未確定です。"
                    : "This provisional scenario uses paid_total from selected shift reports only. The final revenue definition is not approved."}</Tiny>
            </Card>

            <Card>
                <h5>{ja ? "3. 月間売上とレート" : "3. Monthly qualifying revenue and tiers"}</h5>
                <Metrics>
                    <Metric><span>{ja ? "選択したシフト" : "Selected shifts"}</span><strong>{scenario.selected.length}</strong></Metric>
                    <Metric><span>{ja ? "対象売上（仮）" : "Qualifying revenue (preview)"}</span>
                        <strong>{scenario.eligibleRevenue === null ? "—" : yen(scenario.eligibleRevenue, locale)}</strong>
                    </Metric>
                    <Metric><span>{ja ? "今月の歩合率（仮）" : "Monthly rate (preview)"}</span>
                        <strong>{scenario.tierRate === null ? "—" : scenario.tierRate + "%"}</strong>
                    </Metric>
                    <Metric><span>{ja ? "次のレート" : "Next tier"}</span>
                        <strong>{scenario.next
                            ? scenario.next.rate + "% · " + yen(scenario.next.remainingYen, locale)
                            : policy !== null && scenario.tierRate === policy.capRate
                                ? (ja ? `上限 ${policy.capRate}%（暫定）` : `Proposed cap: ${policy.capRate}%`)
                                : "—"}</strong>
                    </Metric>
                </Metrics>
                {scenario.eligibleRevenue !== null ? (
                    <div>
                        <Bar role="progressbar" aria-label={ja ? "次の歩合率まで" : "Progress to next tier"}
                            aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                            <Fill $value={progress} />
                        </Bar>
                        <Tiny>{scenario.next
                            ? (ja ? "次の条件 " : "Next threshold: ") + yen(scenario.next.atYen, locale)
                            : (ja ? `暫定上限：${policy?.capRate ?? "—"}%` : `Proposed rate ceiling: ${policy?.capRate ?? "—"}%`)}</Tiny>
                    </div>
                ) : <Muted>{ja ? "担当シフトを確認・選択してください。" : "Select a verified-by-you qualifying shift to preview a tier."}</Muted>}
                {scenario.selectedOpen > 0 ? <Notice role="note">{ja
                    ? "営業中のシフトが含まれます。売上は未確定です。"
                    : "Your scenario includes open shifts; their revenue is not final."}</Notice> : null}
                {scenario.unverifiedRevenue ? <Notice role="note">{ja
                    ? "売上不明のシフトがあり、試算は利用できません。"
                    : "One or more selected shifts have invalid/unavailable revenue."}</Notice> : null}
                <button type="button" className="small hollow secondary"
                    aria-expanded={showTiers} onClick={() => setShowTiers(value => !value)}>
                    {showTiers ? (ja ? "レート表を閉じる" : "Hide tier schedule")
                        : (ja ? "レート表を見る" : "View tier schedule")}
                </button>
                {showTiers && policy ? (
                    <TierScroll>
                        <TierTable>
                            <thead><tr>
                                <th>{ja ? "対象月間売上" : "Monthly eligible revenue"}</th>
                                <th>{ja ? "レート" : "Rate"}</th>
                            </tr></thead>
                            <tbody>{brackets.map(tier => (
                                <tr key={tier.rate} aria-current={scenario.tierRate === tier.rate ? "true" : undefined}>
                                    <td>{yen(tier.from, locale)}{tier.to === null
                                        ? " +"
                                        : " – " + yen(tier.to, locale)}</td>
                                    <td>{tier.rate}%{tier.rate === policy.capRate ? (ja ? "（暫定上限）" : " (proposed cap)") : ""}</td>
                                </tr>
                            ))}</tbody>
                        </TierTable>
                    </TierScroll>
                ) : null}
            </Card>

            <Card>
                <h5>{ja ? "4. 売上配分の計算例" : "4. Illustrative gross-share calculations"}</h5>
                <Notice role="note">{ja
                    ? "料率を月間対象売上全体に適用する方式と、各段階にのみ適用する方式のどちらが正しいか未確認です。両方とも実際の給与額ではありません。"
                    : "The actual policy has NOT established whether a new tier reprices the entire month's eligible revenue or only the marginal slice. Neither scenario is an approved salary."}</Notice>
                <Metrics>
                    <Metric><span>{ja ? "月全体に最終レートを適用（例）" : "Whole-month flat-tier example"}</span>
                        <strong>{flat === null ? "—" : yen(flat, locale)}</strong></Metric>
                    <Metric><span>{ja ? "段階別の累進方式（例）" : "Marginal/tranche example"}</span>
                        <strong>{marginal === null ? "—" : yen(marginal, locale)}</strong></Metric>
                </Metrics>
            </Card>

            <Card>
                <h5>{ja ? "5. スタッフ費用・調整額（試算入力）" : "5. Staff costs and adjustments (temporary inputs)"}</h5>
                <Muted>{ja
                    ? "未取得の費用を0円とみなさないため、初期値は空欄です。入力しても保存されません。"
                    : "Unknown amounts start blank, never zero. Enter verified amounts only; these values are not stored."}</Muted>
                <CostFields>
                    {([
                        ["staffWages", ja ? "スタッフ基本給（円）" : "Staff base wages (JPY)"],
                        ["drinkback", ja ? "スタッフドリンクバック（円）" : "Staff drinkback (JPY)"],
                        ["deductions", ja ? "本人控除額（円）" : "Manager deductions (JPY)"],
                        ["reimbursements", ja ? "チップ・承認済み還付等（円）" : "Approved additions, tips & reimbursements (JPY)"],
                    ] as const).map(([key, label]) => (
                        <label key={key}>{label}
                            <input type="number" min="0" step="1" placeholder="—"
                                value={costs[key]} onChange={event => setCosts(previous => ({
                                    ...previous, [key]: event.target.value,
                                }))} />
                        </label>
                    ))}
                </CostFields>
                <Tiny>{ja
                    ? "スタッフ基本給とドリンクバックは別々に控除。既に基本給に含まれている場合は二重計上しないでください。"
                    : "Staff wages and drinkback are separate cost categories. If one amount already includes the other, do not deduct it twice."}</Tiny>
                <Metrics>
                    <Metric><span>{ja ? "最終レート方式・差引例" : "Flat-tier net example"}</span>
                        <strong>{flatNet === null ? "—" : yen(flatNet, locale)}</strong></Metric>
                    <Metric><span>{ja ? "累進方式・差引例" : "Marginal net example"}</span>
                        <strong>{marginalNet === null ? "—" : yen(marginalNet, locale)}</strong></Metric>
                </Metrics>
                {!hasCosts ? <Tiny>{ja ? "全費用項目が入力されるまで差引額は表示しません。" : "Net examples remain unavailable until all four cost fields have values."}</Tiny> : null}
                <Actions>
                    <button type="button" className="small hollow secondary" onClick={reset}>{ja ? "試算をリセット" : "Reset scenario"}</button>
                    <button type="button" disabled>{ja ? "給与を保存（未対応）" : "Save payroll — unavailable"}</button>
                </Actions>
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
const ShiftOption = styled.label`
    display:flex;gap:var(--space-1);align-items:center;min-width:0;padding:var(--space-1) 0;
    border-bottom:1px solid var(--neutral-700);cursor:pointer;
    input{width:auto;flex-shrink:0;}
`;
const ShiftText = styled.span`display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;strong{font-weight:500;}`;
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
const CostFields = styled.div`
    display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:var(--space-1);
    @media(min-width:650px){grid-template-columns:repeat(2,minmax(0,1fr));}
    label{display:flex;flex-direction:column;gap:var(--space-0);}
    input{background:var(--dark);width:100%;box-sizing:border-box;}
`;
const Actions = styled.div`display:flex;gap:var(--space-1);flex-wrap:wrap;`;
const Muted = styled.p`color:var(--neutral-300);line-height:1.5;overflow-wrap:anywhere;`;
const Tiny = styled.p`color:var(--neutral-300);font-size:var(--font-size-small);line-height:1.5;`;
const Footnote = styled.p`color:var(--neutral-300);font-size:var(--font-size-small);line-height:1.6;`;
