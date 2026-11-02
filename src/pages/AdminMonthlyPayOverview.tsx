import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";

import { accountApi, type Account } from "../api/account";
import { ApiError, getToken } from "../api/client";
import { createPendingRead } from "../api/pendingRead";
import { localeTag, type Locale } from "../i18n";
import PayBreakdownChart, { type PayChartRow } from "../components/PayBreakdownChart";
import { readRevenueShareViewers } from "./managerRevenueShareAccess";
import { staffPayRow, managerPayRow, totalStaffPay as sumStaffPay, type PayRow } from "./adminMonthlyPayDisplay";

function yen(value: number | null, locale: Locale) {
    if (value === null) return "—";
    return new Intl.NumberFormat(localeTag(locale), {
        style: "currency", currency: "JPY", maximumFractionDigits: 2,
    }).format(value);
}

/** Manager-only comparison for confirmed monthly pay inputs; unknown manager rules remain unavailable. */
export default function AdminMonthlyPayOverview({
    viewer, people, locale, month, refreshVersion, scope = "team",
}: {
    viewer: Account;
    people: Account[];
    locale: Locale;
    month: string;
    refreshVersion: number;
    scope?: "team" | "person";
}) {
    const ja = locale === "ja";
    const teamScope = scope === "team";
    const viewers = readRevenueShareViewers();
    const designated = viewers.chuckUserId !== null && viewers.noriUserId !== null &&
        viewers.chuckUserId !== viewers.noriUserId &&
        (viewer.id === viewers.chuckUserId || viewer.id === viewers.noriUserId);
    const token = getToken();
    const dataKey = JSON.stringify([token, viewer.id, viewer.role, month, people.map(person => [person.id, person.role, person.name])]);
    const [snapshot, setSnapshot] = useState<{ key: string; rows: PayRow[] } | null>(null);
    const rows = useMemo(() => snapshot?.key === dataKey ? snapshot.rows : [], [snapshot, dataKey]);
    const hasSnapshot = snapshot?.key === dataKey;
    const [loading, setLoading] = useState(true);
    const [refreshFailed, setRefreshFailed] = useState(false);
    const [revision, setRevision] = useState(0);
    const generation = useRef(0);
    const pending = useRef(createPendingRead<{ rows: PayRow[]; failed: boolean; denied: boolean }>());

    useEffect(() => {
        const reader = pending.current;
        const invalidate = () => { generation.current++; reader.retire(); setRevision(value => value + 1); };
        const clear = () => { generation.current++; reader.retire(); setSnapshot(null); setRefreshFailed(false); setRevision(value => value + 1); };
        // Cross-device pay inputs can change even when the roster is identical.
        window.addEventListener("barticket-analytics-updated", invalidate);
        window.addEventListener("barticket-shift-updated", invalidate);
        window.addEventListener("barticket-users-updated", invalidate);
        window.addEventListener("barticket-auth", clear);
        return () => {
            window.removeEventListener("barticket-analytics-updated", invalidate);
            window.removeEventListener("barticket-shift-updated", invalidate);
            window.removeEventListener("barticket-users-updated", invalidate);
            window.removeEventListener("barticket-auth", clear);
            reader.retire();
        };
    }, []);

    useEffect(() => {
        if (!token || !designated || viewer.role !== "manager") return;
        let cancelled = false;
        const requestGeneration = generation.current;
        async function load() {
            setLoading(true);
            const result = await pending.current.read(JSON.stringify([dataKey, refreshVersion, revision]), async () => {
            let failed = false;
            let denied = false;
            const results = await Promise.all(people.map(async person => {
                try {
                    if (person.role === "staff") {
                        const data = await accountApi.adminPersonalEarnings(person.id, month);
                        if (data.user_id !== person.id) throw new Error("Profile identity mismatch");
                        return staffPayRow(person, data);
                    }
                    if (person.id === viewers.chuckUserId) {
                        const data = await accountApi.adminChuckMonthlyPay(month);
                        if (data.user_id !== person.id) throw new Error("Profile identity mismatch");
                        return managerPayRow(person, data);
                    }
                    return {
                        person, wages: null, bonus: null, total: null, gross: null,
                        staffCost: null, deductions: null, owed: null, complete: false,
                        message: person.id === viewers.noriUserId ? "owner_summary_in_profile" : "manager_pay_policy_unconfirmed",
                    } satisfies PayRow;
                } catch (err) {
                    failed = true;
                    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) denied = true;
                    return {
                        person, wages: null, bonus: null, total: null, gross: null,
                        staffCost: null, deductions: null, owed: null, complete: false,
                        message: err instanceof Error ? err.message : "Could not load pay",
                    } satisfies PayRow;
                }
            }));
            return { rows: results.sort((a, b) => a.person.name.localeCompare(b.person.name)), failed, denied };
            });
            if (!cancelled && generation.current === requestGeneration && getToken() === token) {
                setSnapshot(result.denied ? null : { key: dataKey, rows: result.rows });
                setRefreshFailed(result.failed);
                setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [designated, viewer, people, month, refreshVersion, viewers.chuckUserId, viewers.noriUserId, token, dataKey, revision]);

    const totalStaffPay = useMemo(() => sumStaffPay(rows), [rows]);
    const staffRows = rows.filter(row => row.person.role === "staff");
    const staffChartRows: PayChartRow[] = staffRows
        .filter(row => row.complete && row.wages !== null && row.bonus !== null && (row.total ?? 0) > 0)
        .map(row => ({
            key: String(row.person.id),
            label: row.person.name,
            segments: [
                { key: "wages", label: ja ? "賃金" : "Wages", value: row.wages ?? 0, color: "var(--royal-400)" },
                { key: "staff-drinks", label: ja ? "スタッフドリンク手当" : "Staff-drink bonus", value: row.bonus ?? 0, color: "var(--success-400)" },
            ],
            total: row.total ?? 0,
        }));
    const incompleteStaffCount = staffRows.filter(row => !row.complete).length;
    const chuckCompositionRows: PayChartRow[] = rows.flatMap(row => {
        if (!row.chuck || !row.complete || row.gross === null || row.staffCost === null || row.deductions === null || row.owed === null) return [];
        if ([row.gross, row.staffCost, row.deductions, row.owed].some(value => value < 0)) return [];
        if (row.gross <= 0 || Math.abs(row.gross - row.staffCost - row.deductions - row.owed) >= 1) return [];
        return [{
            key: `manager-${row.person.id}`,
            label: row.person.name,
            segments: [
                { key: "manager-owed", label: ja ? "Chuckへの支払予定額" : "Amount owed to Chuck", value: row.owed, color: "var(--royal-400)" },
                { key: "staff-owed", label: ja ? "スタッフ給与" : "Staff pay owed", value: row.staffCost, color: "var(--success-400)" },
                { key: "deductions", label: ja ? "その他の控除" : "Other deductions", value: row.deductions, color: "var(--warning-400)" },
            ],
            total: row.gross,
        }];
    });

    if (!designated || viewer.role !== "manager") return <p role="note">{ja
        ? "このアカウントでは給与見積もりを表示できません。"
        : "Pay estimates are not available to this account."}</p>;

    const label = (code: string | undefined): string => {
        if (!code) return "";
        if (code.includes(", ")) return code.split(", ").map(item => label(item)).join(ja ? "。" : "; ");
        if (code === "staff_drink_data_incomplete") return ja ? "ドリンク記録が不足しています" : "Drink records are incomplete";
        if (code === "staff_payroll_costs_incomplete") return ja ? "スタッフ給与の確認が完了していません" : "Staff pay coverage is unverified";
        if (code === "wages_unverified") return ja ? "勤務時間または時給が未確認です" : "Hours or rates are unverified";
        if (code === "drinks_unknown") return ja ? "ドリンク記録が未確認のため、給与総額は未確定です" : "Drink records are unverified; full pay is unavailable";
        if (code === "drinks_incomplete") return ja ? "ドリンク記録が不足しているため、給与総額は未確定です" : "Drink records are incomplete; full pay is unavailable";
        if (code === "wages_and_drinks_unverified") return ja ? "勤務時間・時給とドリンク記録に確認が必要です" : "Hours/rates and drink records need review";
        if (code === "pay_coverage_unverified") return ja ? "給与記録の確認が完了していません" : "Full pay coverage is unverified";
        if (code === "owner_summary_in_profile") return ja ? "オーナーの月次サマリーは、Nori本人のプロフィールの「給与」で確認できます。給与や利益とは異なる、その他の経費を差し引く前の残額です。" : "The monthly owner summary is available in Nori’s own Profile → Pay. It shows the remainder before other expenses, not salary or profit.";
        if (code === "manager_pay_policy_unconfirmed") return ja ? "給与ルールが未設定です" : "Pay rule is not configured";
        return code.split(", ").map(item => item.replaceAll("_", " ")).join(", ");
    };

    return (
        <Panel aria-busy={loading} aria-label={teamScope ? (ja ? "月次給与一覧" : "Monthly team pay") : (ja ? "月次給与" : "Monthly pay")}>
            <Header>
                <div>
                    <h2>{teamScope ? (ja ? "月次給与一覧" : "Monthly team pay") : (ja ? "月次給与" : "Monthly pay")}</h2>
                    <p>{ja
                        ? "選択した月の勤務と給与見積もりです。支払い記録ではありません。"
                        : "Work and estimated pay for the selected month. This is not a payment record."}</p>
                </div>
            </Header>
            {loading && hasSnapshot ? <p role="status">{ja ? "給与情報を更新中…" : "Updating pay information…"}</p> : null}
            {!loading && refreshFailed ? <p role="alert">{ja
                ? "最新の給与情報を確認できませんでした。表示されている金額は最新ではない可能性があります。更新して再試行してください。"
                : "Could not verify the latest pay information. Displayed amounts may be out of date. Refresh to try again."}</p> : null}
            {loading && !hasSnapshot ? <p role="status">{ja ? "給与情報を読み込み中…" : "Loading monthly pay…"}</p> : (
                <>
                    {teamScope ? <PayTotal>
                        <span>{ja ? "スタッフ給与合計" : "Total staff pay"}</span>
                        <strong>{totalStaffPay === null ? (ja ? "未確認" : "Incomplete") : yen(totalStaffPay, locale)}</strong>
                        <p>{ja ? "スタッフの給与見積もり。マネージャーの金額は含みません。" : "Estimated staff pay. Manager amounts are separate."}</p>
                        {totalStaffPay === null ? <small>{ja ? "未確認の給与記録があります。各メンバー欄の確認状況をご確認ください。" : "Some pay records are unverified. See each member’s coverage below."}</small> : null}
                    </PayTotal> : null}
                    <People aria-label={ja ? "メンバー別の給与" : "Pay by team member"}>
                        {rows.map(row => {
                            const ownerSummary = row.message === "owner_summary_in_profile";
                            return <Person key={row.person.id} aria-label={row.person.name}>
                                <PersonHeader>
                                    <Identity>
                                        <h3>{row.person.name}</h3>
                                        <span>{ownerSummary ? (ja ? "オーナー" : "Owner") : row.person.role === "manager" ? (ja ? "マネージャー" : "Manager") : (ja ? "スタッフ" : "Staff")}</span>
                                    </Identity>
                                    {!ownerSummary ? <Owed aria-label={row.complete ? (ja ? "支払予定額" : "Amount owed") : (ja ? "給与総額は未確定" : "Full pay unavailable")}>
                                        <strong>{yen(row.owed, locale)}</strong>
                                        <span>{row.complete ? (ja ? "給与見積もり" : "Estimated pay") : (ja ? "総額は未確定" : "Full pay unavailable")}</span>
                                    </Owed> : null}
                                </PersonHeader>
                                {!row.complete ? <CoverageNote role="note">
                                    <strong>{ownerSummary ? (ja ? "月次オーナーサマリー" : "Monthly owner summary") : (ja ? "確認が必要です" : "Needs verification")}</strong>
                                    <p>{label(row.message)}</p>
                                </CoverageNote> : null}
                                {!ownerSummary ? <Breakdown>
                                    {row.person.role === "staff" ? <>
                                        <div><dt>{ja ? "記録済みの賃金" : "Recorded wages"}</dt><dd>{yen(row.wages, locale)}</dd></div>
                                        <div><dt>{ja ? "記録済みのドリンク手当" : "Recorded drink bonus"}</dt><dd>{yen(row.bonus, locale)}</dd></div>
                                    </> : <>
                                        <div><dt>{ja ? "総給与" : "Gross pay"}</dt><dd>{yen(row.gross, locale)}</dd></div>
                                        <div><dt>{ja ? "記録済みのスタッフ給与" : "Recorded staff pay"}</dt><dd>{yen(row.staffCost, locale)}</dd></div>
                                        <div><dt>{ja ? "控除" : "Deductions"}</dt><dd>{yen(row.deductions, locale)}</dd></div>
                                    </>}
                                </Breakdown> : null}
                                {row.chuck ? <ManagerDetail aria-label={ja ? "Chuck担当シフトのスタッフ給与と控除の詳細" : "Details: staff owed on Chuck-managed shifts and deductions"}>
                                    <h4>{ja ? "スタッフ給与と控除の内訳" : "Staff pay and deductions"}</h4>
                                    {row.chuck.staff_owed.length ? <ul>
                                        {row.chuck.staff_owed.map(item => <li key={item.user_id}>
                                            <strong>{item.name}</strong>
                                            <Breakdown>
                                                <div><dt>{ja ? "賃金" : "Wages"}</dt><dd>{yen(item.wages_yen, locale)}</dd></div>
                                                <div><dt>{ja ? "ドリンク手当" : "Drink bonus"}</dt><dd>{yen(item.staff_drink_bonus_yen, locale)}</dd></div>
                                            </Breakdown>
                                        </li>)}
                                    </ul> : <p>{ja ? "スタッフ別の内訳はありません。" : "No staff breakdown is available."}</p>}
                                    {row.chuck.deductions.length ? <ul>
                                        {row.chuck.deductions.map(item => <li key={"deduction-" + item.id}>
                                            <DeductionHeading><span>{item.payee_name}</span><strong>{yen(item.amount_yen, locale)}</strong></DeductionHeading>
                                            <p><time dateTime={item.business_date}>{item.business_date}</time> · {item.reason}</p>
                                        </li>)}
                                    </ul> : <p>{ja ? "控除の明細はありません。" : "No deduction entries are recorded."}</p>}
                                </ManagerDetail> : null}
                            </Person>;
                        })}
                        {!rows.length ? <p>{ja ? "この月の記録がありません。" : "No pay records for this month."}</p> : null}
                    </People>
                    {teamScope && (staffChartRows.length > 0 || chuckCompositionRows.length > 0) ? <ChartSection>
                        <h3>{ja ? "給与の比較グラフ" : "Pay comparison charts"}</h3>
                    {teamScope && staffChartRows.length ? <PayBreakdownChart
                        title={ja ? "スタッフ別の月間給与" : "Monthly staff pay by person"}
                        rows={staffChartRows} locale={locale}
                        note={ja ? `勤務時間・時給とドリンク記録を確認済みの${staffChartRows.length}名のみ表示。給与見積もりであり支払記録ではありません。`
                            : `Showing ${staffChartRows.length} member(s) with verified hours/rates and drink coverage. These are pay estimates, not payment records.`} /> : null}
                    {teamScope && incompleteStaffCount ? <p role="note">{ja
                        ? `${incompleteStaffCount}名分は給与記録の確認が完了していないためグラフに含めていません。表の「—」は0円ではなく未確認です。`
                        : `${incompleteStaffCount} member(s) are omitted from the chart because full pay coverage is unverified. “—” means unavailable, not ¥0.`}</p> : null}
                    {teamScope && staffRows.length && !staffChartRows.length && !incompleteStaffCount ? <p role="note">{ja
                        ? "確認済みのスタッフ給与がまだありません。"
                        : "No confirmed staff pay amounts are available to chart yet."}</p> : null}
                    {teamScope && chuckCompositionRows.length ? <PayBreakdownChart
                        title={ja ? "Chuckの月間給与配分" : "Chuck’s monthly pay allocation"}
                        rows={chuckCompositionRows} locale={locale}
                        note={ja ? "確認済み金額の内訳です。金額は支払済みを意味しません。"
                            : "Breakdown of confirmed amounts. Amounts owed do not mean they have been paid."} /> : null}
                    </ChartSection> : null}
                </>
            )}
        </Panel>
    );
}

const Panel = styled.section`
    display:flex;flex-direction:column;gap:var(--space-3);min-width:0;
    color:var(--neutral-100);
`;
const Header = styled.div`
    h2{font-size:var(--font-size-h4);font-weight:600;line-height:1.3;}
    p{margin-top:var(--space-0);color:var(--neutral-300);max-width:65ch;line-height:1.5;}
`;
const PayTotal = styled.div`
    display:flex;flex-direction:column;align-items:flex-start;gap:var(--space-0);
    padding:var(--space-2);background:var(--neutral-900);border-radius:12px;min-width:0;
    >span{font-weight:500;}
    >strong{font-size:var(--font-size-h2);font-weight:600;line-height:1.2;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;}
    p,small{color:var(--neutral-300);font-size:var(--font-size-small);line-height:1.5;max-width:65ch;}
`;
const People = styled.div`display:flex;flex-direction:column;min-width:0;`;
const Person = styled.article`
    display:flex;flex-direction:column;gap:var(--space-2);min-width:0;padding:var(--space-3) 0;
    &+&{border-top:1px solid var(--neutral-700);}
    &:first-child{padding-top:0;}
    &:last-child{padding-bottom:0;}
`;
const PersonHeader = styled.div`
    display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-2);flex-wrap:wrap;min-width:0;
`;
const Identity = styled.div`
    flex:1 1 120px;min-width:0;overflow-wrap:anywhere;
    h3{font-size:var(--font-size-h5);font-weight:600;line-height:1.4;}
    span{display:block;color:var(--neutral-300);font-size:var(--font-size-small);margin-top:var(--space-0);}
`;
const Owed = styled.div`
    display:flex;flex-direction:column;gap:var(--space-0);text-align:end;min-width:0;max-width:100%;
    margin-inline-start:auto;overflow-wrap:anywhere;font-variant-numeric:tabular-nums;
    strong{font-size:var(--font-size-h4);font-weight:600;line-height:1.3;}
    span{font-size:var(--font-size-small);color:var(--neutral-300);line-height:1.5;}
`;
const CoverageNote = styled.div`
    padding-inline-start:var(--space-1);border-inline-start:2px solid var(--neutral-500);max-width:65ch;
    strong{font-size:var(--font-size-small);font-weight:600;}
    p{color:var(--neutral-300);font-size:var(--font-size-p);line-height:1.5;overflow-wrap:anywhere;margin-top:var(--space-0);}
`;
const Breakdown = styled.dl`
    display:flex;flex-direction:column;gap:var(--space-1);margin:0;min-width:0;
    >div{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto);gap:var(--space-2);align-items:baseline;}
    dt{color:var(--neutral-300);line-height:1.5;overflow-wrap:anywhere;}
    dd{margin:0;text-align:end;font-weight:500;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;}
`;
const ManagerDetail = styled.section`
    display:flex;flex-direction:column;gap:var(--space-1);min-width:0;
    h4{font-size:var(--font-size-p);font-weight:600;line-height:1.5;}
    >p,li>p{color:var(--neutral-300);font-size:var(--font-size-small);line-height:1.5;overflow-wrap:anywhere;}
    ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--space-2);}
    li{min-width:0;overflow-wrap:anywhere;}
    li>strong{font-weight:500;display:block;margin-bottom:var(--space-0);}
`;
const DeductionHeading = styled.div`
    display:flex;justify-content:space-between;gap:var(--space-1);flex-wrap:wrap;
    strong{font-weight:500;font-variant-numeric:tabular-nums;}
`;
const ChartSection = styled.section`
    display:flex;flex-direction:column;gap:var(--space-2);padding-top:var(--space-2);border-top:1px solid var(--neutral-700);min-width:0;
    >h3{font-size:var(--font-size-h5);font-weight:600;}
    >p{font-size:var(--font-size-small);color:var(--neutral-300);line-height:1.5;max-width:65ch;}
`;
