import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";

import { accountApi, type Account, type ChuckMonthlyPayPreview, type PersonalEarningsPreview } from "../api/account";
import { localeTag, type Locale } from "../i18n";
import PayBreakdownChart, { type PayChartRow } from "../components/PayBreakdownChart";
import { readRevenueShareViewers } from "./managerRevenueShareAccess";

type PayRow = {
    person: Account;
    wages: number | null;
    bonus: number | null;
    total: number | null;
    gross: number | null;
    staffCost: number | null;
    deductions: number | null;
    owed: number | null;
    complete: boolean;
    message?: string;
    chuck?: ChuckMonthlyPayPreview;
};

function yen(value: number | null, locale: Locale) {
    if (value === null) return "—";
    return new Intl.NumberFormat(localeTag(locale), {
        style: "currency", currency: "JPY", maximumFractionDigits: 2,
    }).format(value);
}

function staffRow(person: Account, data: PersonalEarningsPreview): PayRow {
    const wages = data.categories.find(item => item.category === "hourly_wages");
    const drinks = data.categories.find(item => item.category === "staff_drink_bonus");
    const wageValue = wages?.amount_yen_unrounded === null || wages?.amount_yen_unrounded === undefined
        ? null : Number(wages.amount_yen_unrounded);
    const bonusValue = drinks?.complete ? drinks.amount_yen : null;
    const complete = Boolean(wages?.complete && wageValue !== null && drinks?.complete && bonusValue !== null);
    return {
        person, wages: wageValue, bonus: bonusValue,
        total: complete ? wageValue! + bonusValue! : null,
        gross: null, staffCost: null, deductions: null,
        owed: complete ? wageValue! + bonusValue! : null,
        complete,
        message: complete ? undefined : "pay_inputs_incomplete",
    };
}

function chuckRow(person: Account, data: ChuckMonthlyPayPreview): PayRow {
    return {
        person, wages: null, bonus: null, total: null,
        gross: data.gross_salary_yen,
        staffCost: data.staff_cost_total_yen,
        deductions: data.deduction_total_yen,
        owed: data.net_amount_owed_yen,
        complete: data.complete,
        message: data.complete ? undefined : data.blockers.join(", "),
        chuck: data,
    };
}

/** Manager-only comparison for confirmed monthly pay inputs; unknown manager rules remain unavailable. */
export default function AdminMonthlyPayOverview({
    viewer, people, locale, month, refreshVersion,
}: {
    viewer: Account;
    people: Account[];
    locale: Locale;
    month: string;
    refreshVersion: number;
}) {
    const ja = locale === "ja";
    const viewers = readRevenueShareViewers();
    const designated = viewers.chuckUserId !== null && viewers.noriUserId !== null &&
        viewers.chuckUserId !== viewers.noriUserId &&
        (viewer.id === viewers.chuckUserId || viewer.id === viewers.noriUserId);
    const [rows, setRows] = useState<PayRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!designated || viewer.role !== "manager") return;
        let cancelled = false;
        async function load() {
            setLoading(true);
            const results = await Promise.all(people.map(async person => {
                try {
                    if (person.role === "staff") {
                        const data = await accountApi.adminPersonalEarnings(person.id, month);
                        if (data.user_id !== person.id) throw new Error("Profile identity mismatch");
                        return staffRow(person, data);
                    }
                    if (person.id === viewers.chuckUserId) {
                        const data = await accountApi.adminChuckMonthlyPay(month);
                        if (data.user_id !== person.id) throw new Error("Profile identity mismatch");
                        return chuckRow(person, data);
                    }
                    return {
                        person, wages: null, bonus: null, total: null, gross: null,
                        staffCost: null, deductions: null, owed: null, complete: false,
                        message: "manager_pay_policy_unconfirmed",
                    } satisfies PayRow;
                } catch (err) {
                    return {
                        person, wages: null, bonus: null, total: null, gross: null,
                        staffCost: null, deductions: null, owed: null, complete: false,
                        message: err instanceof Error ? err.message : "Could not load pay",
                    } satisfies PayRow;
                }
            }));
            if (!cancelled) {
                setRows(results.sort((a, b) => a.person.name.localeCompare(b.person.name)));
                setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [designated, viewer, people, month, refreshVersion, viewers.chuckUserId]);

    const totalStaffPay = useMemo(() => {
        const staffRows = rows.filter(row => row.person.role === "staff");
        return staffRows.length && staffRows.every(row => row.owed !== null)
            ? staffRows.reduce((sum, row) => sum + (row.owed ?? 0), 0)
            : null;
    }, [rows]);
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

    if (!designated || viewer.role !== "manager") return null;

    const label = (code: string | undefined) => {
        if (!code) return "";
        if (code === "pay_inputs_incomplete") return ja ? "勤務時間または時給が未確認です" : "Hours or rates are incomplete";
        if (code === "manager_pay_policy_unconfirmed") return ja ? "給与ルールが未設定です" : "Pay rule is not configured";
        return code.split(", ").map(item => item.replaceAll("_", " ")).join(", ");
    };

    return (
        <Panel aria-label={ja ? "月次給与一覧" : "Monthly team pay"}>
            <Header>
                <div>
                    <h2>{ja ? "月次給与一覧" : "Monthly team pay"}</h2>
                    <p>{ja
                        ? "選択した月の勤務と給与見積もりです。支払い記録ではありません。"
                        : "Work and estimated pay for the selected month. This is not a payment record."}</p>
                </div>
            </Header>
            {loading ? <p role="status">{ja ? "給与情報を読み込み中…" : "Loading monthly pay…"}</p> : (
                <>
                    <PayTotal>
                        <span>{ja ? "スタッフ給与合計" : "Total staff pay"}</span>
                        <strong>{totalStaffPay === null ? (ja ? "未確認" : "Incomplete") : yen(totalStaffPay, locale)}</strong>
                        {totalStaffPay === null ? <small>{ja ? "時給または勤務時間が未確認のメンバーがいます。下の各メンバー欄をご確認ください。" : "Some hours or rates are missing. See the individual records below."}</small> : null}
                    </PayTotal>
                    {staffChartRows.length ? <PayBreakdownChart
                        title={ja ? "スタッフ別の月間給与" : "Monthly staff pay by person"}
                        rows={staffChartRows} locale={locale}
                        note={ja ? `記録が揃っている${staffChartRows.length}名のみ表示。給与見積もりであり支払記録ではありません。`
                            : `Showing ${staffChartRows.length} member(s) with complete records. These are pay estimates, not payment records.`} /> : null}
                    {incompleteStaffCount ? <p role="note">{ja
                        ? `${incompleteStaffCount}名分は勤務時間または時給が未確認のためグラフに含めていません。表の「—」は0円ではなく未確認です。`
                        : `${incompleteStaffCount} member(s) are omitted from the chart because hours or rates are incomplete. “—” means unavailable, not ¥0.`}</p> : null}
                    {staffRows.length && !staffChartRows.length && !incompleteStaffCount ? <p role="note">{ja
                        ? "確認済みのスタッフ給与がまだありません。"
                        : "No confirmed staff pay amounts are available to chart yet."}</p> : null}
                    {chuckCompositionRows.length ? <PayBreakdownChart
                        title={ja ? "Chuckの月間給与配分" : "Chuck’s monthly pay allocation"}
                        rows={chuckCompositionRows} locale={locale}
                        note={ja ? "確認済み金額の内訳です。金額は支払済みを意味しません。"
                            : "Breakdown of confirmed amounts. Amounts owed do not mean they have been paid."} /> : null}
                    <People aria-label={ja ? "メンバー別の給与" : "Pay by team member"}>
                        {rows.map(row => <Person key={row.person.id}>
                            <PersonHeader>
                                <div><strong>{row.person.name}</strong><small>{row.person.role === "manager" ? (ja ? "マネージャー" : "Manager") : (ja ? "スタッフ" : "Staff")}</small></div>
                                <Owed aria-label={ja ? "支払予定額" : "Amount owed"}>{yen(row.owed, locale)}<small>{row.complete ? (ja ? "見積もり" : "estimated") : label(row.message)}</small></Owed>
                            </PersonHeader>
                            {row.person.role === "staff" ? <Breakdown>
                                <span>{ja ? "賃金" : "Wages"}<strong>{yen(row.wages, locale)}</strong></span>
                                <span>{ja ? "ドリンク手当" : "Drink bonus"}<strong>{yen(row.bonus, locale)}</strong></span>
                            </Breakdown> : <Breakdown>
                                <span>{ja ? "総給与" : "Gross pay"}<strong>{yen(row.gross, locale)}</strong></span>
                                <span>{ja ? "スタッフ給与" : "Staff pay"}<strong>{yen(row.staffCost, locale)}</strong></span>
                                <span>{ja ? "控除" : "Deductions"}<strong>{yen(row.deductions, locale)}</strong></span>
                            </Breakdown>}
                            {row.chuck ? <details aria-label={ja ? "Chuck担当シフトのスタッフ給与と控除の詳細" : "Details: staff owed on Chuck-managed shifts and deductions"}>
                                <summary>{ja ? "スタッフ給与と控除の内訳" : "Staff pay and deductions"}</summary>
                                <ul>
                                    {row.chuck.staff_owed.map(item => <li key={item.user_id}>
                                        {item.name}: {ja ? "賃金" : "wages"} {yen(item.wages_yen, locale)} · {ja ? "ドリンク手当" : "drink bonus"} {yen(item.staff_drink_bonus_yen, locale)}
                                    </li>)}
                                    {row.chuck.deductions.map(item => <li key={"deduction-" + item.id}>
                                        {item.business_date} · {item.payee_name}: {yen(item.amount_yen, locale)} · {item.reason}
                                    </li>)}
                                </ul>
                            </details> : null}
                        </Person>)}
                        {!rows.length ? <p>{ja ? "この月の記録がありません。" : "No pay records for this month."}</p> : null}
                    </People>
                </>
            )}
        </Panel>
    );
}

const Panel = styled.section`
    display:flex;flex-direction:column;gap:var(--space-2);
    padding:var(--space-2);background:var(--neutral-900);border-radius:12px;min-width:0;
`;
const Header = styled.div`
    display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-2);flex-wrap:wrap;
    h2{font-size:var(--font-size-h4);}
    p{color:var(--neutral-300);max-width:850px;}
    button{width:auto;}
`;
const PayTotal = styled.div`
    display:flex;flex-direction:column;gap:var(--space-0);padding:var(--space-1);
    background:var(--neutral-800);border-radius:8px;
    span,small{color:var(--neutral-300);}
    strong{font-size:var(--font-size-h4);}
`;
const People = styled.div`display:flex;flex-direction:column;gap:var(--space-1);`;
const Person = styled.article`
    display:flex;flex-direction:column;gap:var(--space-1);padding:var(--space-1);
    border:1px solid var(--neutral-700);border-radius:10px;min-width:0;
    details summary{cursor:pointer;}
`;
const PersonHeader = styled.div`
    display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-1);
    small{display:block;color:var(--neutral-300);}
`;
const Owed = styled.strong`
    text-align:right;font-size:var(--font-size-h5);
    small{font-size:var(--font-size-small);font-weight:400;}
`;
const Breakdown = styled.div`
    display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:var(--space-1);
    span{display:flex;flex-direction:column;gap:var(--space-0);color:var(--neutral-300);}
    strong{color:var(--neutral-100);}
`;
