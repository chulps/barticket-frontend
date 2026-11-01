import styled from "styled-components";
import type { ChuckMonthlyPayPreview } from "../api/account";
import { localeTag, type Locale } from "../i18n";
import { buildChuckPayBreakdown } from "./chuckPayBreakdown";
import PayAllocationDonut from "./PayAllocationDonut";
import { chuckPayDisplay } from "./chuckPayDisplay";

export default function ChuckPayBreakdown({ report, locale }: { report: ChuckMonthlyPayPreview; locale: Locale }) {
    const ja = locale === "ja";
    const data = buildChuckPayBreakdown(report);
    const partial = chuckPayDisplay(report).staffSubtotalPartial;
    const money = (value: number | null) => value == null ? "—" : new Intl.NumberFormat(localeTag(locale), {
        style: "currency", currency: "JPY", maximumFractionDigits: 0,
    }).format(value);
    const fullAllocation = data.recordedRemaining !== null && data.recordedRemaining >= 0 && report.deduction_total_yen >= 0 && data.staffSlices.length === data.staff.length * 2;
    const staffSlices = data.staffSlices.map((part, index) => ({
        id: part.id, label: `${part.name} · ${part.kind === "wages" ? (ja ? "賃金" : "Wages") : (ja ? "記録済みドリンク手当" : "Recorded drink bonus")}`,
        value: part.value, display: money(part.value),
        color: ["var(--success-400)", "var(--success-600)", "var(--warning-400)", "var(--warning-600)", "var(--royal-300)", "var(--royal-600)"][index % 6],
    }));
    const chartSlices = fullAllocation ? [
        { id:"retained", label:ja ? "記録済み費用差引後の残額（暫定）" : "Remaining after recorded costs (provisional)", value:data.recordedRemaining!, display:money(data.recordedRemaining), color:"var(--royal-400)" },
        ...staffSlices,
        { id:"deductions", label:ja ? "記録済み控除" : "Recorded deductions", value:report.deduction_total_yen,
            display:money(report.deduction_total_yen), color:"var(--danger-400)" },
    ] : [];
    const chartTotal = chartSlices.reduce((sum, part) => sum + part.value, 0);
    const categories: Record<string, string> = {
        manager_pay_deduction: ja ? "マネージャー給与控除" : "Manager-pay deduction",
        manager_paid_staff_tip: ja ? "マネージャー負担のスタッフチップ" : "Manager-paid staff tip",
        language_exchange_commission: ja ? "言語交流イベント手数料" : "Language-exchange commission",
        staff_drink_bonus_adjustment: ja ? "スタッフドリンク手当調整" : "Staff-drink bonus adjustment",
    };
    return <Section aria-label={ja ? "売上から給与までの内訳" : "Revenue to pay breakdown"}>
        <Layout>
        <DetailsColumn aria-label={ja ? "給与と控除の明細" : "Pay and deduction details"}>
        <Flow>
            <Line><dt>{ja ? "Chuck担当シフトの対象売上" : "Eligible revenue on your managed shifts"}</dt><dd>{money(report.eligible_revenue_yen)}</dd></Line>
            <Line><dt>{ja ? "給与配分率" : "Your revenue-share rate"}</dt><dd>{report.tier_rate_percent == null ? "—" : `${report.tier_rate_percent}%`}</dd></Line>
            <Line><dt>{ja ? "スタッフ給与・控除前の自分の取り分" : "Your gross share before staff pay and deductions"}</dt><dd>{money(report.gross_salary_yen)}</dd></Line>
            <Line><dt>{partial ? (ja ? "記録済みスタッフ給与の小計（一部）" : "Recorded staff pay subtotal (partial)") : (ja ? "スタッフ給与" : "Staff pay")}</dt><dd>{money(data.recordedStaffCost)}</dd></Line>
            <Line><dt>{ja ? "記録済み控除（取消を含む）" : "Recorded deductions, net of reversals"}</dt><dd>{money(report.deduction_total_yen)}</dd></Line>
            <Line $total><dt>{ja ? "記録済み費用差引後の残額（暫定）" : "Remaining after recorded costs (provisional)"}</dt><dd>{money(data.recordedRemaining)}</dd></Line>
            <Line><dt>{data.retained === null ? (ja ? "全体の見積もり（未確認）" : "Full estimate (not verified)") : (ja ? "報告済みの給与見積もり" : "Reported pay estimate")}</dt><dd>{money(data.retained)}</dd></Line>
        </Flow>
        </DetailsColumn>
        <ChartColumn aria-label={ja ? "取り分の配分グラフ" : "Share allocation chart"}>
            {chartSlices.length > 0 && chartTotal > 0 ? <Note role="note">{ja ? "中央はスタッフ給与・控除前の総取り分です。" : "Center: gross share before staff pay and deductions."}</Note> : null}
            {chartSlices.length > 0 && chartTotal > 0 ? <PayAllocationDonut
                title={ja ? "総取り分の配分（記録済みデータ）" : "Gross share allocation (recorded data)"} slices={chartSlices}
                center={money(report.gross_salary_yen)} locale={locale}
                note={ja ? "記録済みの費用と残額の配分です。" : "Allocation of recorded costs and remaining share."} /> : fullAllocation && chartTotal === 0 ? <Note role="status">{ja ? "記録済みの総取り分は0円のため、円グラフはありません。" : "The recorded gross share is zero, so there is no allocation to chart."}</Note> : <Note role="status">{ja ? "記録済みの金額が不明・不整合・負の場合、円グラフは表示しません。金額の明細で符号付きの金額を確認してください。" : "The donut is unavailable for unknown, inconsistent or negative allocations. See the signed amounts in the details."}</Note>}
        </ChartColumn>
        </Layout>
        <LedgerDetails>
        <h3>{ja ? "給与からの記録済み控除" : "Recorded deductions from your share"}</h3>
        {data.deductions.length ? <List aria-label={ja ? "控除の明細" : "Deduction entries"}>{data.deductions.map(item => <Item key={item.id}>
            <div><strong>{categories[item.category] ?? item.category}</strong><Note>{item.business_date}{item.payee_name ? ` · ${item.payee_name}` : ""}</Note><p>{item.reason}</p>
                {item.reversal_of_id !== null ? <Note>{ja ? "取消元の記録" : "Reversal of entry"} #{item.reversal_of_id}</Note> : null}</div>
            <Amount>{money(item.amount_yen)}</Amount>
        </Item>)}</List> : <Note>{ja ? "控除は記録されていません。未記録の現金引出しや支払いがないことを意味するものではありません。" : "No deductions are recorded. This does not confirm that there were no unrecorded withdrawals or payments."}</Note>}
        <h3>{ja ? "スタッフ別の配分" : "What goes to each staff member"}</h3>
        {data.staff.length ? <List aria-label={ja ? "スタッフ別給与の明細" : "Staff pay entries"}>{data.staff.map(person => <Item key={person.id}>
            <div><strong>{person.name}</strong><Note>{ja ? "賃金" : "Wages"} {money(person.wages)} · {ja ? "記録済みスタッフドリンク手当" : "Recorded staff-drink bonus"} {money(person.drinks)}</Note></div>
            <Amount>{money(person.total)}</Amount>
        </Item>)}</List> : <Note>{ja ? "この月の担当シフトにスタッフ給与の記録はありません。記録がないことは、スタッフがいなかったことの確認ではありません。" : "No staff-pay records for your managed shifts this month. Missing records do not confirm that no staff worked."}</Note>}
        </LedgerDetails>
    </Section>;
}
export function ChuckPayMethodology({ locale }: { locale: Locale }) {
    const ja = locale === "ja";
    return <>
        <Note>{ja ? "対象売上 × 配分率 = 総取り分。そこから記録済みスタッフ給与と控除を各1回差し引いた額が暫定残額です。全体の見積もりは、必要な記録が揃い整合するまで表示しません。" : "Eligible revenue × share rate = gross share. Subtract each recorded staff cost and deduction once for the provisional remainder. The full estimate stays unavailable until its required records reconcile."}</Note>
        <Note>{ja ? "未記録・未確認の時間やドリンク等は含まず、不明を0円とは扱いません。給与が支払済みか、現金を受領したかは、この見積もりからは判断できません。" : "Missing or unverified hours, drinks and other inputs are excluded, not assumed to be zero. This estimate does not establish which wages have been paid or which cash has been received."}</Note>
        <Note>{ja ? "正の控除は取り分を減らし、負の取消は戻します。区分・受取人・理由を記録どおり表示し、金額が同じでも勤務給与との重複を推測して削除しません。" : "Positive deductions reduce your share; negative reversals restore it. Categories, recipients and reasons stay as recorded; matching amounts are not automatically deduplicated against wages."}</Note>
    </>;
}
const Section = styled.section`display:flex; flex-direction:column; gap:var(--space-1); min-width:0; h3 {margin-top:var(--space-3); font-size:var(--font-size-h4); line-height:1.35;}`;
const LedgerDetails = styled.div`min-width:0; display:flex; flex-direction:column; gap:var(--space-1);`;
const Layout = styled.div`display:grid; grid-template-columns:minmax(0, 1fr); gap:var(--space-3); @media(min-width:1000px) {grid-template-columns:minmax(0, 1.1fr) minmax(0, 1fr); align-items:start;}`;
const DetailsColumn = styled.section`min-width:0; display:flex; flex-direction:column; gap:var(--space-1);`;
const ChartColumn = styled.aside`min-width:0; display:flex; flex-direction:column; gap:var(--space-1);`;
const Flow = styled.dl`margin:0; padding:0;`;
const Line = styled.div<{ $total?: boolean }>`display:flex; justify-content:space-between; gap:var(--space-2); padding:var(--space-1) 0; border-top:${({$total}) => $total ? "1px solid var(--neutral-500)" : "none"}; font-weight:${({$total}) => $total ? 700 : 400}; dt {min-width:0; overflow-wrap:anywhere;} dd {margin:0; flex-shrink:0; font-family:var(--font-family-data); font-variant-numeric:tabular-nums; overflow-wrap:anywhere; max-width:55%;}`;
const Note = styled.p`color:var(--neutral-200); font-size:calc(var(--font-size-p) * .875); line-height:1.6; overflow-wrap:anywhere;`;
const List = styled.ul`list-style:none; margin:0; padding:0;`;
const Item = styled.li`display:flex; justify-content:space-between; gap:var(--space-2); padding:var(--space-1) 0; border-bottom:1px solid var(--neutral-700); > div {min-width:0; overflow-wrap:anywhere;}`;
const Amount = styled.strong`font-family:var(--font-family-data); font-variant-numeric:tabular-nums; flex-shrink:0; max-width:55%; overflow-wrap:anywhere;`;
