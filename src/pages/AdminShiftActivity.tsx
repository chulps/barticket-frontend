import { useMemo, useState } from "react";
import styled from "styled-components";
import { localeTag, type Locale } from "../i18n";
import { recordedStaffTotals, type StaffActivityRow } from "./staffProfileData";

type Props = {
    rows: StaffActivityRow[];
    locale: Locale;
    selectedMonth: string;
    onMonthChange: (month: string) => void;
};
const PAGE_SIZE = 12;
function dateLabel(value: string, locale: Locale) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(localeTag(locale), {
        year: "numeric", month: "short", day: "numeric", weekday: "short",
    });
}
function monthLabel(value: string, locale: Locale) {
    const [y, m] = value.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(localeTag(locale), {
        year: "numeric", month: "long",
    });
}
function duration(seconds: number | null) {
    return seconds === null ? "—" : (seconds / 3600).toFixed(1) + " h";
}
function quantity(row: StaffActivityRow) {
    return row.drinks.reduce((sum, drink) => sum + drink.quantity, 0);
}

/** Drill into ID-linked recorded activity using existing reads only. */
export default function AdminShiftActivity({ rows, locale, selectedMonth, onMonthChange }: Props) {
    const ja = locale === "ja";
    const [year, setYear] = useState<string | null>(null);
    const [visible, setVisible] = useState(PAGE_SIZE);
    const years = useMemo(() => [...new Set(rows.map(row => row.businessDate.slice(0, 4)))].sort().reverse(), [rows]);
    const activeYear = year && years.includes(year) ? year : null;
    const yearRows = rows.filter(row => row.businessDate.startsWith(activeYear ?? ""));
    const months = [...new Set(yearRows.map(row => row.businessDate.slice(0, 7)))].sort().reverse();
    const activeMonth = selectedMonth !== "all" && months.includes(selectedMonth) ? selectedMonth : null;
    const monthRows = rows.filter(row => activeMonth && row.businessDate.startsWith(activeMonth));

    function selectYear(value: string) {
        setYear(value); onMonthChange("all"); setVisible(PAGE_SIZE);
    }
    function selectMonth(value: string) {
        onMonthChange(value); setVisible(PAGE_SIZE);
    }
    function backToYears() {
        setYear(null); onMonthChange("all"); setVisible(PAGE_SIZE);
    }
    function metric(list: StaffActivityRow[]) {
        const totals = recordedStaffTotals(list);
        return <Muted>
            {totals.recordedShifts} {ja ? "シフト" : "shifts"}
            {" · "}{duration(totals.hoursSeconds)}
            {" · "}{totals.drinkCount === null ? "—" : totals.drinkCount} {ja ? "ドリンク" : "drinks"}
        </Muted>;
    }
    return (
        <Area aria-label={ja ? "シフト履歴の詳細" : "Recorded shift activity drill-down"}>
            <header>
                <h4>{ja ? "記録されたシフト別勤務状況" : "Recorded shift activity"}</h4>
                <Muted>{ja ? "年 → 月 → シフトを選んで詳細を確認" : "Select year → month → shift for details"}</Muted>
            </header>
            {!rows.length ? (
                <Muted>{ja ? "本人IDに紐づいた記録はありません。0時間を意味しません。" : "No ID-linked records. Missing does not mean zero hours."}</Muted>
            ) : !activeYear ? (
                <Groups aria-label={ja ? "年を選択" : "Choose year"}>
                    {years.map(value => {
                        const items = rows.filter(row => row.businessDate.startsWith(value));
                        return <GroupButton type="button" key={value} onClick={() => selectYear(value)}>
                            <GroupTitle>{value}<span aria-hidden="true">›</span></GroupTitle>
                            {metric(items)}
                        </GroupButton>;
                    })}
                </Groups>
            ) : !activeMonth ? (
                <>
                    <Back type="button" className="small hollow secondary" onClick={backToYears}>
                        {ja ? "← 年別一覧" : "← All years"}
                    </Back>
                    <h5>{activeYear} {ja ? "年のシフト" : "shift activity"}</h5>
                    <Groups aria-label={ja ? "月を選択" : "Choose month"}>
                        {months.map(value => {
                            const items = yearRows.filter(row => row.businessDate.startsWith(value));
                            return <GroupButton type="button" key={value} onClick={() => selectMonth(value)}>
                                <GroupTitle>{monthLabel(value, locale)}<span aria-hidden="true">›</span></GroupTitle>
                                {metric(items)}
                            </GroupButton>;
                        })}
                    </Groups>
                </>
            ) : (
                <>
                    <Back type="button" className="small hollow secondary" onClick={() => selectMonth("all")}>
                        {ja ? "← 月別一覧" : "← All months"}
                    </Back>
                    <h5>{monthLabel(activeMonth, locale)}</h5>
                    {metric(monthRows)}
                    <Nights>
                        {monthRows.slice(0, visible).map(row => (
                            <Night key={row.shiftId}>
                                <summary>
                                    <NightTitle>
                                        <strong>{dateLabel(row.businessDate, locale)} · #{row.shiftId}</strong>
                                        <Muted>{row.status === "open" ? (ja ? "営業中" : "Open shift") : (ja ? "終了" : "Closed shift")}
                                            {row.clockedIn ? (ja ? " · 勤務中" : " · Clocked in") : ""}
                                        </Muted>
                                    </NightTitle>
                                    <NightValue>
                                        <strong>{duration(row.hoursSeconds)}</strong>
                                        <Muted>{row.drinks.length ? quantity(row) + (ja ? " 杯" : " drinks") : (ja ? "ドリンク未記録" : "No recorded drinks")}</Muted>
                                    </NightValue>
                                </summary>
                                <NightDetail>
                                    <p>{ja ? "記録された勤務時間" : "Recorded hours"}: {duration(row.hoursSeconds)}</p>
                                    <p>{ja ? "記録されたドリンク" : "Recorded drinks"}: {row.drinks.length ? quantity(row) : "—"}</p>
                                    {row.drinks.map((drink, index) => <p key={index}>{drink.name} × {drink.quantity}</p>)}
                                    <Muted>{ja ? "「—」は未記録であり、0ではありません。" : "“—” means not recorded, not zero."}</Muted>
                                </NightDetail>
                            </Night>
                        ))}
                    </Nights>
                    {monthRows.length > visible ? (
                        <Back type="button" className="small hollow secondary" onClick={() => setVisible(count => count + PAGE_SIZE)}>
                            {ja ? "さらに12シフトを表示" : "Show 12 more shifts"}
                            {" (" + Math.min(visible, monthRows.length) + "/" + monthRows.length + ")"}
                        </Back>
                    ) : null}
                </>
            )}
        </Area>
    );
}
const Area = styled.section`
    display: flex; flex-direction: column; gap: var(--space-1); min-width: 0;
    h4, h5 { font-size: var(--font-size-h4); font-weight: 500; }
`;
const Groups = styled.div`
    display: grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap: var(--space-1);
    @media (min-width: 750px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;
const GroupButton = styled.button`
    && { display: flex; flex-direction: column; align-items: stretch; min-width: 0; text-align: left;
        background: var(--neutral-900); border: 1px solid var(--neutral-700); padding: var(--space-1); }
    &&:hover, &&:focus-visible { border-color: var(--neutral-400); }
`;
const GroupTitle = styled.strong`
    display: flex; align-items: center; justify-content: space-between; gap: var(--space-1);
    span { font-size: 1.4em; }
`;
const Muted = styled.p`color: var(--neutral-300); font-size: var(--font-size-small); overflow-wrap: anywhere;`;
const Back = styled.button`&& { align-self: flex-start; width: auto; }`;
const Nights = styled.div`display: flex; flex-direction: column; gap: var(--space-0);`;
const Night = styled.details`
    border-bottom: 1px solid var(--neutral-700); min-width: 0;
    summary { cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: var(--space-1);
        padding: var(--space-1) 0; list-style-position: inside; }
    summary:focus-visible { outline: 2px solid var(--royal-400); }
`;
const NightTitle = styled.div`min-width: 0; strong { display: block; font-weight: 500; }`;
const NightValue = styled.div`flex-shrink: 0; text-align: right; strong { font-weight: 500; }`;
const NightDetail = styled.div`
    padding: var(--space-1); background: var(--neutral-900); border-radius: 8px;
    display: flex; flex-direction: column; gap: var(--space-0);
`;
