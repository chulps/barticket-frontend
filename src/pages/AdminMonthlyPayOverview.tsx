import { Fragment, useEffect, useMemo, useState } from "react";
import styled from "styled-components";

import { accountApi, type Account, type ChuckMonthlyPayPreview, type PersonalEarningsPreview } from "../api/account";
import { localeTag, type Locale } from "../i18n";
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

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

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
    const bonusValue = drinks?.amount_yen ?? 0;
    const complete = Boolean(wages?.complete && wageValue !== null);
    return {
        person, wages: wageValue, bonus: bonusValue,
        total: complete ? wageValue! + bonusValue : null,
        gross: null, staffCost: null, deductions: null,
        owed: complete ? wageValue! + bonusValue : null,
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
    viewer, people, locale, refreshVersion,
}: {
    viewer: Account;
    people: Account[];
    locale: Locale;
    refreshVersion: number;
}) {
    const ja = locale === "ja";
    const viewers = readRevenueShareViewers();
    const designated = viewers.chuckUserId !== null && viewers.noriUserId !== null &&
        viewers.chuckUserId !== viewers.noriUserId &&
        (viewer.id === viewers.chuckUserId || viewer.id === viewers.noriUserId);
    const [month, setMonth] = useState(currentMonth);
    const [rows, setRows] = useState<PayRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);

    useEffect(() => {
        if (!designated || viewer.role !== "manager") return;
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError("");
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
    }, [designated, viewer, people, month, refreshVersion, reload, viewers.chuckUserId, ja]);

    const totalStaffPay = useMemo(() => {
        const staffRows = rows.filter(row => row.person.role === "staff");
        return staffRows.length && staffRows.every(row => row.owed !== null)
            ? staffRows.reduce((sum, row) => sum + (row.owed ?? 0), 0)
            : null;
    }, [rows]);

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
                        ? "確認済みの勤務時間・時給・スタッフドリンク手当と、Chuck担当シフトの給与内訳を表示します。試算であり支払記録ではありません。"
                        : "Compare recorded wages and staff-drink bonuses, plus Chuck's pay for his managed shifts. These are estimates, not payment records."}</p>
                </div>
                <button type="button" className="small hollow secondary" disabled={loading}
                    onClick={() => setReload(value => value + 1)}>{ja ? "更新" : "Refresh"}</button>
            </Header>
            <Toolbar>
                <label>{ja ? "対象月" : "Month"}
                    <input type="month" value={month} onChange={event => setMonth(event.target.value)} />
                </label>
            </Toolbar>
            {error ? <p role="alert">{error}</p> : null}
            {loading ? <p role="status">{ja ? "給与情報を読み込み中…" : "Loading monthly pay…"}</p> : (
                <>
                    <Summary>
                        <Metric>
                            <span>{ja ? "スタッフ給与合計" : "Total staff pay"}</span>
                            <strong>{yen(totalStaffPay, locale)}</strong>
                            {totalStaffPay === null ? <small>{ja ? "一部の時間または時給が未確認です" : "Unavailable until all staff hours and rates are verified"}</small> : null}
                        </Metric>
                        <Metric>
                            <span>{ja ? "表示月" : "Month"}</span>
                            <strong>{month}</strong>
                        </Metric>
                    </Summary>
                    <Scroll>
                        <table>
                            <thead><tr>
                                <th>{ja ? "メンバー" : "Team member"}</th>
                                <th>{ja ? "賃金 / 総給与" : "Wages / gross salary"}</th>
                                <th>{ja ? "ドリンク手当 / スタッフ給与" : "Drink bonus / staff pay"}</th>
                                <th>{ja ? "控除" : "Deductions"}</th>
                                <th>{ja ? "支払予定額" : "Amount owed"}</th>
                                <th>{ja ? "状態" : "Status"}</th>
                            </tr></thead>
                            <tbody>
                                {rows.map(row => (
                                    <Fragment key={row.person.id}>
                                    <tr>
                                        <th scope="row">{row.person.name}<small>{row.person.role === "manager" ? (ja ? "マネージャー" : "Manager") : (ja ? "スタッフ" : "Staff")}</small></th>
                                        <td>{row.person.role === "staff" ? yen(row.wages, locale) : yen(row.gross, locale)}</td>
                                        <td>{row.person.role === "staff" ? yen(row.bonus, locale) : yen(row.staffCost, locale)}</td>
                                        <td>{row.person.role === "staff" ? "—" : yen(row.deductions, locale)}</td>
                                        <td><strong>{yen(row.owed, locale)}</strong></td>
                                        <td>{row.complete ? (ja ? "記録あり" : "Recorded") : label(row.message)}</td>
                                        {row.chuck ? <tr>
                                            <td colSpan={6}>
                                                <details>
                                                    <summary>{ja ? "Chuck担当シフトのスタッフ給与と控除の詳細" : "Details: staff owed on Chuck-managed shifts and deductions"}</summary>
                                                    <ul>
                                                        {row.chuck.staff_owed.map(item => <li key={item.user_id}>
                                                            {item.name}: {ja ? "賃金" : "wages"} {yen(item.wages_yen, locale)} · {ja ? "ドリンク手当" : "drink bonus"} {yen(item.staff_drink_bonus_yen, locale)}
                                                        </li>)}
                                                        {row.chuck.deductions.map(item => <li key={"deduction-" + item.id}>
                                                            {item.business_date} · {item.payee_name}: {yen(item.amount_yen, locale)} · {item.reason}
                                                        </li>)}
                                                    </ul>
                                                </details>
                                            </td>
                                        </tr> : null}
                                    </Fragment>
                                ))}
                                {!rows.length ? <tr><td colSpan={6}>{ja ? "この月の記録がありません。" : "No pay records for this month."}</td></tr> : null}
                            </tbody>
                        </table>
                    </Scroll>
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
const Toolbar = styled.div`
    display:flex;justify-content:flex-end;
    label{display:flex;flex-direction:column;gap:var(--space-0);min-width:190px;}
    input{background:var(--dark);}
`;
const Summary = styled.div`
    display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:var(--space-1);
`;
const Metric = styled.div`
    display:flex;flex-direction:column;gap:var(--space-0);padding:var(--space-1);
    background:var(--neutral-800);border-radius:8px;
    span,small{color:var(--neutral-300);}
`;
const Scroll = styled.div`
    width:100%;overflow-x:auto;
    table{width:100%;border-collapse:collapse;min-width:760px;}
    th,td{text-align:left;vertical-align:top;padding:var(--space-1);border-bottom:1px solid var(--neutral-700);}
    thead th{color:var(--neutral-300);font-weight:500;}
    tbody th{font-weight:600;}
    small{display:block;color:var(--neutral-300);font-weight:400;}
    details{min-width:500px;}
`;
