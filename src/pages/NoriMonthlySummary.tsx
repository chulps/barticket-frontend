import { subscribeRealtime } from "../api/realtime";
import { useEffect, useState } from "react";
import styled from "styled-components";
import { ApiError, getToken } from "../api/client";
import { getNoriMonthlyPay, type NoriMonthlyPay, type NoriPayee } from "../api/noriPay";
import { HorizontalBarChart, type NamedBar } from "../components/AnalyticsCharts";
import Icon from "../components/Icon";
import RequestState from "../components/RequestState";
import { localeTag, type Locale } from "../i18n";
import { shiftMonth } from "./analyticsNavigation";

const payeeNames: Record<NoriPayee, string> = { chuck: "Chuck", haruka: "Haruka", kanata: "Kanata" };
function thisMonth() {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    return parts.find(part => part.type === "year")!.value + "-" + parts.find(part => part.type === "month")!.value;
}
function yen(value: number | null, locale: Locale) {
    return value === null ? "—" : new Intl.NumberFormat(localeTag(locale), {
        style: "currency", currency: "JPY", maximumFractionDigits: 0,
    }).format(value);
}
function amount(row: NoriMonthlyPay["staff_owed"][number]) {
    return row.status === "estimate" && !row.blockers.includes("staff_drink_data_incomplete") && row.user_id !== null && Number.isSafeInteger(row.user_id) && row.user_id > 0 && row.source !== null &&
        row.amount_yen !== null && Number.isSafeInteger(row.amount_yen) && row.amount_yen >= 0
        ? row.amount_yen : null;
}
function ownerAmount(income: NoriMonthlyPay["own_income"]) {
    return income.status === "estimate" && income.complete === true && income.blockers.length === 0 &&
        income.source === "monthly_revenue_less_recorded_staff_earnings" && income.basis === "before_other_expenses" &&
        income.amount_yen !== null && Number.isSafeInteger(income.amount_yen) ? income.amount_yen : null;
}
function verifiedYen(value: number | null | undefined, locale: Locale) {
    return yen(typeof value === "number" && Number.isSafeInteger(value) ? value : null, locale);
}
function blocker(code: string, ja: boolean) {
    const text: Record<string, [string, string]> = {
        payee_identity_not_configured: ["アカウントの設定が必要です。", "The payee account needs configuration."],
        payee_identity_unavailable: ["アカウントを確認できません。", "The payee account could not be verified."],
        payee_identity_conflict: ["アカウントの割り当てに重複があります。", "Payee account assignments conflict."],
        staff_earnings_incomplete: ["給与の記録に確認が必要です。", "Pay records need verification."],
        no_verified_wage_records: ["確認済みの賃金記録がありません。", "No verified wage records are available."],
        owner_income_rule_unconfirmed: ["オーナー収入の計算ルールが未確定です。", "The owner-income calculation rule is not approved."],
        staff_hours_unverified: ["勤務時間の確認が必要です。", "Work hours need verification."],
        staff_hourly_rate_missing: ["時給の設定が必要です。", "An hourly rate is missing."],
        hourly_wages_incomplete: ["勤務時間または時給の確認が必要です。", "Hours or hourly rates need verification."],
        staff_drink_data_incomplete: ["スタッフドリンク記録が不足しています。", "Staff-drink records are incomplete."],
        staff_drink_bonus_incomplete: ["スタッフドリンク手当の確認が必要です。", "Staff-drink bonuses need verification."],
        staff_payroll_costs_incomplete: ["スタッフ給与の確認が必要です。", "Staff payroll costs need verification."],
        working_manager_unassigned: ["担当マネージャーが未設定のシフトがあります。", "A shift has no confirmed manager."],
        working_manager_shift_open: ["対象シフトが営業中です。", "A qualifying shift is still open."],
        month_shift_open: ["この月に営業中のシフトがあります。", "A shift in this month is still open."],
        unassigned_staff_history: ["スタッフが未設定の勤務記録があります。", "A work record has no assigned staff member."],
        unattributed_staff_drink: ["スタッフが未設定のドリンク手当があります。", "A staff-drink bonus has no assigned recipient."],
        staff_earnings_identity_unavailable: ["給与の受取人を確認できません。", "A staff earnings recipient could not be verified."],
        chuck_earnings_incomplete: ["Chuckの給与に確認が必要です。", "Chuck’s earnings need verification."],
        staff_adjustment_recipient_unknown: ["給与調整の受取人を確認できません。", "A pay adjustment has no verified recipient."],
        no_recorded_shifts: ["この月のシフト記録がありません。", "No shifts are recorded for this month."],
    };
    return text[code]?.[ja ? 0 : 1] ?? (ja ? "給与の記録に確認が必要です。" : "A pay record needs review.");
}

export default function NoriMonthlySummary({ userId, locale }: { userId: number; locale: Locale }) {
    const ja = locale === "ja";
    const [month, setMonth] = useState(thisMonth);
    const [refresh, setRefresh] = useState(0);
    useEffect(() => subscribeRealtime(["analytics", "shift", "tickets", "users"], () => setRefresh(value => value + 1)), []);
    const [result, setResult] = useState<{
        key: string; report: NoriMonthlyPay | null; failure: "forbidden" | "unavailable" | "error" | null;
    } | null>(null);
    const requestKey = `${userId}:${month}`;
    const current = result?.key === requestKey ? result : null;
    const report = current?.report ?? null;
    const loading = current === null;
    const failure = current?.failure ?? null;
    useEffect(() => {
        let cancelled = false;
        const token = getToken();
        getNoriMonthlyPay(month).then(result => {
            if (cancelled || getToken() !== token) return;
            if (result.user_id !== userId || result.month !== month || result.preview_only !== true ||
                result.coverage !== "recorded_inputs_only" || result.payment_records_available !== false) {
                throw new Error("Owner summary identity, period or coverage mismatch");
            }
            setResult({key:requestKey, report:result, failure:null});
        }).catch(error => {
            if (cancelled || getToken() !== token) return;
            setResult({key:requestKey, report:null, failure:error instanceof ApiError && [401, 403].includes(error.status) ? "forbidden"
                : error instanceof ApiError && [404, 503].includes(error.status) ? "unavailable" : "error"});
        });
        return () => { cancelled = true; };
    }, [userId, month, requestKey, refresh]);

    const rows = report?.staff_owed ?? [];
    const comparable = rows.length === 3 && new Set(rows.map(row => row.payee)).size === 3 &&
        rows.every(row => amount(row) !== null);
    const bars: NamedBar[] = comparable ? rows.map(row => ({
        id: row.payee,
        label: row.name ?? payeeNames[row.payee],
        value: amount(row)!,
        display: yen(amount(row), locale),
    })) : [];
    const [year, number] = month.split("-").map(Number);
    const monthLabel = new Date(year, number - 1, 1).toLocaleDateString(localeTag(locale), {
        month: "long", year: "numeric",
    });
    return <Panel aria-label={ja ? "Noriの月次サマリー" : "Nori's monthly summary"}>
        <Heading>
            <h2>{ja ? "月次オーナーサマリー" : "Monthly owner summary"}</h2>
            <button type="button" className="small hollow secondary" disabled={loading}
                onClick={() => setRefresh(value => value + 1)}>{ja ? "更新" : "Refresh"}</button>
        </Heading>
        <MonthNav aria-label={ja ? "月を選択" : "Choose month"}>
            <button type="button" className="hollow secondary" aria-label={ja ? "前月" : "Previous month"}
                onClick={() => setMonth(value => shiftMonth(value, -1))}><Icon name="CaretLeft" /></button>
            <strong aria-live="polite">{monthLabel}</strong>
            <button type="button" className="hollow secondary" aria-label={ja ? "翌月" : "Next month"}
                onClick={() => setMonth(value => shiftMonth(value, 1))}><Icon name="CaretRight" /></button>
        </MonthNav>
        {loading ? <RequestState kind="loading" /> : failure ? <RequestState
            kind={failure === "forbidden" ? "forbidden" : failure === "unavailable" ? "empty" : "error"}
            detail={failure === "unavailable" ? (ja ? "オーナーの給与サマリーはまだ利用できません。" : "The owner pay summary is not available yet.") : undefined}
        /> : report ? <>
            <OwnIncome>
                <span>{ja ? "スタッフ給与差引後の残額" : "Remaining after staff earnings"}</span>
                <strong>{yen(ownerAmount(report.own_income), locale)}</strong>
                <p>{ja ? "その他の経費を差し引く前の見積もりです。利益や支払いの記録ではありません。" : "Before other expenses. This is an estimate, not profit or a payment record."}</p>
                {ownerAmount(report.own_income) === null ? <p role="status">{report.own_income.blockers.length
                    ? [...new Set(report.own_income.blockers.map(code => blocker(code, ja)))].join(" ")
                    : (ja ? "売上またはスタッフ給与の確認が必要です。" : "Revenue or staff earnings need verification.")}</p> : null}
            </OwnIncome>
            <p>{ja ? "以下は記録に基づく給与見積もりです。支払済み金額ではありません。" : "The amounts below are pay estimates from recorded inputs, not payments made."}</p>
            <h3>{ja ? "支払予定額" : "Estimated amounts owed"}</h3>
            <Payees>{rows.map(row => <Payee key={row.payee}>
                <div>
                    <strong>{row.name ?? payeeNames[row.payee]}</strong>
                    {amount(row) === null ? <p>{row.blockers.length ? [...new Set(row.blockers.map(code => blocker(code, ja)))].join(" ")
                        : (ja ? "金額を確認できません。" : "Amount unavailable.")}</p>
                        : <p>{ja ? "見積もり" : "Estimate"}</p>}
                </div>
                <Value>{yen(amount(row), locale)}</Value>
            </Payee>)}</Payees>
            {bars.length === 3 ? <details><summary>{ja ? "金額を比較" : "Compare amounts"}</summary>
                <HorizontalBarChart title={ja ? "メンバー別の給与見積もり" : "Estimated pay by person"} bars={bars} locale={locale} />
            </details> : null}
            <details><summary>{ja ? "見積もりの情報源" : "Estimate sources"}</summary>
                <p>{ja ? "記録された月間売上から、全スタッフの給与・手当（Chuckの差引後給与を含む）を差し引いた残額です。下の3名だけの合計ではありません。不明な金額は0円として扱いません。" : "The remainder uses recorded monthly revenue less all staff earnings, including Chuck’s net pay. It is not limited to the three people listed here. Missing amounts are not zero."}</p>
                <p>{ja ? "売上は営業日ベースで、未回収の売掛金を含む場合があります。現金の受取額や使える残高ではありません。" : "Revenue follows the service date and may include uncollected amounts. This is not cash received or an available balance."}</p>
                <SourceFigures>
                    <div><dt>{ja ? "記録された売上" : "Recorded revenue"}</dt><dd>{verifiedYen(report.own_income.revenue_yen, locale)}</dd></div>
                    <div><dt>{ja ? "全スタッフの給与・手当" : "All staff earnings"}</dt><dd>{verifiedYen(report.own_income.staff_earnings_yen, locale)}</dd></div>
                </SourceFigures>
                <p>{ja ? "家賃・仕入れなど、その他の経費は含まれていません。スタッフの給与として記録されていないマネージャー控除も差し引きません。経費が未確認のため、純利益は算出しません。" : "Other expenses, such as rent and supplies, are excluded. Manager deductions not recorded as staff earnings are also excluded. Net profit is not calculated while expenses are unknown."}</p>
                <ul>{rows.map(row => <li key={row.payee}>{row.name ?? payeeNames[row.payee]}: {row.source === "chuck_monthly_pay_preview"
                    ? (ja ? "月次マネージャー給与見積もり" : "Monthly manager-pay estimate")
                    : row.source === "personal_earnings_preview" ? (ja ? "個人の賃金・手当見積もり" : "Personal wages and bonus estimate")
                        : (ja ? "情報源を確認できません" : "Source unavailable")}</li>)}</ul>
            </details>
        </> : null}
    </Panel>;
}

const Panel = styled.section`
    display:flex;flex-direction:column;gap:var(--space-2);min-width:0;
    padding:var(--space-2);background:var(--neutral-900);border-radius:12px;
    h2,h3{font-size:var(--font-size-h4);font-weight:500;}
    summary{cursor:pointer;padding:var(--space-1) 0;}
`;
const Heading = styled.div`display:flex;justify-content:space-between;align-items:start;gap:var(--space-1);button{width:auto;}`;
const MonthNav = styled.div`
    display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;gap:var(--space-1);
    strong{text-align:center;}button{width:44px;min-height:44px;padding:0;}
`;
const OwnIncome = styled.div`
    display:flex;flex-direction:column;gap:var(--space-1);padding:var(--space-2);
    background:var(--neutral-800);border-radius:10px;strong{font-size:var(--font-size-h3);overflow-wrap:anywhere;}p{color:var(--neutral-300);}
`;
const Payees = styled.div`display:flex;flex-direction:column;`;
const Payee = styled.div`
    display:flex;justify-content:space-between;gap:var(--space-2);padding:var(--space-1) 0;
    border-bottom:1px solid var(--neutral-700);min-width:0;
    p{color:var(--neutral-300);font-size:var(--font-size-small);}div{min-width:0;overflow-wrap:anywhere;}
`;
const Value = styled.strong`white-space:nowrap;`;

const SourceFigures = styled.dl`
    margin:var(--space-1) 0;
    div{display:flex;justify-content:space-between;gap:var(--space-1);flex-wrap:wrap;}
    dt{min-width:0;overflow-wrap:anywhere;}dd{margin:0;font-variant-numeric:tabular-nums;}
`;
