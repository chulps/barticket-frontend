import { useState } from "react";
import styled from "styled-components";
import { localeTag, type Locale } from "../i18n";
import { recordedStaffTotals, type StaffActivityRow } from "./staffProfileData";

type Props = {
    rows: StaffActivityRow[];
    locale: Locale;
};
const PAGE_SIZE = 12;
function dateLabel(value: string, locale: Locale) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(localeTag(locale), {
        year: "numeric", month: "short", day: "numeric", weekday: "short",
    });
}
function duration(seconds: number | null) {
    return seconds === null ? "—" : (seconds / 3600).toFixed(1) + " h";
}
function quantity(row: StaffActivityRow) {
    return row.drinks.reduce((sum, drink) => sum + drink.quantity, 0);
}

/** Drill into ID-linked recorded activity using existing reads only. */
export default function AdminShiftActivity({ rows, locale }: Props) {
    const ja = locale === "ja";
    const [visible, setVisible] = useState(PAGE_SIZE);
    const periodRows = rows;
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
                <h4>{ja ? "対象期間のシフト" : "Shifts in this period"}</h4>
            </header>
            {!rows.length ? (
                <Muted>{ja ? "本人IDに紐づいた記録はありません。0時間を意味しません。" : "No ID-linked records. Missing does not mean zero hours."}</Muted>
            ) : (
                <>
                    {periodRows.length ? metric(periodRows) : <Muted>{ja ? "この期間のシフト記録はありません。" : "No shift records for this period."}</Muted>}
                    <Nights>
                        {periodRows.slice(0, visible).map(row => (
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
                    {periodRows.length > visible ? (
                        <LoadMore type="button" className="small hollow secondary" onClick={() => setVisible(count => count + PAGE_SIZE)}>
                            {ja ? "さらに12シフトを表示" : "Show 12 more shifts"}
                            {" (" + Math.min(visible, periodRows.length) + "/" + periodRows.length + ")"}
                        </LoadMore>
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
const Muted = styled.p`color: var(--neutral-300); font-size: var(--font-size-small); overflow-wrap: anywhere;`;
const LoadMore = styled.button`&& { align-self: flex-start; width: auto; }`;
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
