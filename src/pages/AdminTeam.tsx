import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";

import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ApiError } from "../api/client";
import { localeTag, type Locale } from "../i18n";
import AnalyticsDatePicker from "../components/AnalyticsDatePicker";
import Icon from "../components/Icon";
import TabGroup from "../components/TabGroup";
import { buildStaffActivity, recordedStaffTotals } from "./staffProfileData";
import AdminTeamEditors, { type AdminDrinkLine } from "./AdminTeamEditors";
import AdminManagerShare from "./AdminManagerShare";
import AdminMonthlyPayOverview from "./AdminMonthlyPayOverview";
import AdminShiftActivity from "./AdminShiftActivity";
import { shiftDay, shiftMonth, shiftYear } from "./analyticsNavigation";
import { canSeeChuckRevenueShare, readRevenueShareViewers } from "./managerRevenueShareAccess";

const revenueShareViewers = readRevenueShareViewers();
type TimeScale = "all" | "year" | "month" | "day";

type Props = {
    viewer: Account;
    people: Account[];
    accountsError: string;
    locale: Locale;
    selectedId: number | null;
    onSelect: (id: number | null) => void;
    onAudit: (id: number) => void;
};

function hoursLabel(seconds: number) {
    return (seconds / 3600).toLocaleString(undefined, {
        minimumFractionDigits: 1, maximumFractionDigits: 1,
    }) + " h";
}

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function monthLabel(value: string, locale: Locale) {
    const [year, month] = value.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(localeTag(locale), { month: "long", year: "numeric" });
}

function dayLabel(value: string, locale: Locale) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(localeTag(locale), { year: "numeric", month: "short", day: "numeric" });
}

function dayInMonth(month: string, preferredDay: number) {
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    return `${month}-${String(Math.min(preferredDay, lastDay)).padStart(2, "0")}`;
}

/**
 * Nested under Admin's manager-only role guard. Reads manager shift history and
 * writes only through existing audited rate and punch-correction APIs.
 */
export default function AdminTeam({ viewer, people, accountsError, locale, selectedId, onSelect, onAudit }: Props) {
    const ja = locale === "ja";
    const [timeScale, setTimeScale] = useState<TimeScale>("month");
    const [month, setMonth] = useState(currentMonth);
    const [year, setYear] = useState(() => String(new Date().getFullYear()));
    const [day, setDay] = useState(currentDate);
    const [closed, setClosed] = useState<ShiftReport[]>([]);
    const [current, setCurrent] = useState<ShiftReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setLoadError("");
            try {
                // /analytics/shifts includes verified spreadsheet hours merged
                // into each date. /shifts contains clock data only.
                const shiftHistory = (await accountApi.analyticsShifts())
                    .filter(shift => shift.id !== null && shift.status !== null) as ShiftReport[];
                if (!cancelled) {
                    setClosed(shiftHistory.filter(shift => shift.status === "closed"));
                    setCurrent(shiftHistory.find(shift => shift.status === "open") ?? null);
                }
            } catch (err) {
                if (!cancelled) {
                    setClosed([]);
                    setCurrent(null);
                    setLoadError(err instanceof ApiError ? err.message
                        : ja ? "勤務記録を読み込めませんでした。" : "Could not load staff shift records.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [refreshKey, ja]);

    const person = selectedId === null ? null : people.find(member => member.id === selectedId) ?? null;
    // Generic hourly-pay, time-correction and drinkback drafts apply to staff, not managers.
    // Keep manager profiles (including Chuck and Nori) focused on history and their own policies.
    const isStaffProfile = person?.role === "staff";
    const shifts = useMemo(() => {
        const unique = new Map<number, ShiftReport>();
        closed.filter(shift => shift.status === "closed").forEach(shift => unique.set(shift.id, shift));
        if (current?.status === "open") unique.set(current.id, current);
        return [...unique.values()];
    }, [closed, current]);

    const activity = useMemo(() =>
        person ? buildStaffActivity(person.id, closed, current) : [],
    [person, closed, current]);
    const periodActivity = useMemo(() => activity.filter(row => {
        if (timeScale === "all") return true;
        if (timeScale === "year") return row.businessDate.startsWith(year);
        if (timeScale === "month") return row.businessDate.startsWith(month);
        return row.businessDate === day;
    }), [activity, timeScale, year, month, day]);
    const totals = useMemo(() => recordedStaffTotals(periodActivity), [periodActivity]);
    const drinkLines = useMemo<AdminDrinkLine[]>(() => {
        if (!person) return [];
        return shifts.flatMap(shift => (shift.staff_drinks ?? [])
            .filter(drink => drink.staff_id === person.id && drink.quantity > 0)
            .map(drink => ({
                shiftId: shift.id,
                businessDate: shift.business_date,
                ticketId: drink.ticket_id,
                name: drink.drink_name,
                quantity: drink.quantity,
                revenue: drink.revenue,
            }))).filter(line => {
                if (timeScale === "all") return true;
                if (timeScale === "year") return line.businessDate.startsWith(year);
                if (timeScale === "month") return line.businessDate.startsWith(month);
                return line.businessDate === day;
            })
            .sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.shiftId - a.shiftId);
    }, [shifts, person, timeScale, year, month, day]);

    return (
        <Root>
            <Toolbar>
                <div>
                    <h2>{ja ? "チームメンバー" : "Team members"}</h2>
                    <Muted>{ja ? "期間を選び、勤務と給与を確認します。" : "Choose a time scale to review work and pay."}</Muted>
                </div>
            </Toolbar>
            <TabGroup<TimeScale>
                label={ja ? "表示期間" : "Time scale"}
                tabs={[
                    { id: "all", label: ja ? "全期間" : "All Time" },
                    { id: "year", label: ja ? "年" : "Year" },
                    { id: "month", label: ja ? "月次" : "Monthly" },
                    { id: "day", label: ja ? "日次" : "Daily" },
                ]}
                activeTab={timeScale}
                onChange={scale => {
                    setTimeScale(scale);
                    if (scale === "year") setYear(month.slice(0, 4));
                    if (scale === "month") setMonth(value => `${year}-${value.slice(5, 7)}`);
                    if (scale === "day") setDay(value => dayInMonth(month, Number(value.slice(8, 10))));
                }}
            />
            {timeScale === "year" ? <PeriodNav>
                <StepButton type="button" className="hollow secondary" aria-label={ja ? "前年" : "Previous year"}
                    onClick={() => {
                        const next = shiftYear(year, -1);
                        setYear(next);
                        setMonth(value => `${next}-${value.slice(5, 7)}`);
                        setDay(value => `${next}-${value.slice(5, 7)}-01`);
                    }}><Icon name="CaretLeft" size="var(--font-size-h4)" /></StepButton>
                <strong>{year}</strong>
                <StepButton type="button" className="hollow secondary" aria-label={ja ? "翌年" : "Next year"}
                    onClick={() => {
                        const next = shiftYear(year, 1);
                        setYear(next);
                        setMonth(value => `${next}-${value.slice(5, 7)}`);
                        setDay(value => `${next}-${value.slice(5, 7)}-01`);
                    }}><Icon name="CaretRight" size="var(--font-size-h4)" /></StepButton>
            </PeriodNav> : null}
            {timeScale === "month" ? <PeriodNav>
                <StepButton type="button" className="hollow secondary" aria-label={ja ? "前月" : "Previous month"}
                    onClick={() => {
                        const next = shiftMonth(month, -1);
                        setMonth(next); setYear(next.slice(0, 4)); setDay(`${next}-01`);
                    }}><Icon name="CaretLeft" size="var(--font-size-h4)" /></StepButton>
                <strong>{monthLabel(month, locale)}</strong>
                <StepButton type="button" className="hollow secondary" aria-label={ja ? "翌月" : "Next month"}
                    onClick={() => {
                        const next = shiftMonth(month, 1);
                        setMonth(next); setYear(next.slice(0, 4)); setDay(`${next}-01`);
                    }}><Icon name="CaretRight" size="var(--font-size-h4)" /></StepButton>
            </PeriodNav> : null}
            {timeScale === "day" ? <DayPeriodNav>
                <StepButton type="button" className="hollow secondary" aria-label={ja ? "前日" : "Previous day"}
                    onClick={() => {
                        const next = shiftDay(day, -1);
                        setDay(next); setMonth(next.slice(0, 7)); setYear(next.slice(0, 4));
                    }}><Icon name="CaretLeft" size="var(--font-size-h4)" /></StepButton>
                <AnalyticsDatePicker label={dayLabel(day, locale)} value={day}
                    shiftDates={activity.map(row => row.businessDate)} onChange={value => {
                        setDay(value); setMonth(value.slice(0, 7)); setYear(value.slice(0, 4));
                    }} />
                <StepButton type="button" className="hollow secondary" aria-label={ja ? "翌日" : "Next day"}
                    onClick={() => {
                        const next = shiftDay(day, 1);
                        setDay(next); setMonth(next.slice(0, 7)); setYear(next.slice(0, 4));
                    }}><Icon name="CaretRight" size="var(--font-size-h4)" /></StepButton>
            </DayPeriodNav> : null}
            <RefreshRow>
                <button type="button" className="small hollow secondary" disabled={loading}
                    onClick={() => setRefreshKey(key => key + 1)}>{ja ? "更新" : "Refresh"}</button>
            </RefreshRow>
            <Layout $hasSelection={selectedId !== null}>
                <Directory aria-label={ja ? "チーム一覧" : "Team directory"}>
                    <DirectoryHeading>{ja ? "メンバー" : "People"}</DirectoryHeading>
                    {accountsError ? <Error role="alert">{accountsError}</Error> : null}
                    {people.length ? people.map(member => (
                        <Member
                            key={member.id} type="button"
                            className={selectedId === member.id ? "secondary" : "hollow secondary"}
                            aria-current={selectedId === member.id ? "page" : undefined}
                            onClick={() => onSelect(member.id)}>
                            <Badge aria-hidden="true">{member.name.trim().slice(0, 1).toUpperCase() || "•"}</Badge>
                            <MemberText>
                                <strong>{member.name}</strong>
                                <span>{member.role === "manager" ? (ja ? "マネージャー" : "Manager") : (ja ? "スタッフ" : "Staff")}</span>
                            </MemberText>
                            <Chevron aria-hidden="true">›</Chevron>
                        </Member>
                    )) : !accountsError ? <Muted>{ja ? "メンバーはいません。" : "No team members."}</Muted> : null}
                </Directory>
                <Detail>
                    {selectedId === null ? (
                        <Placeholder>
                            <h3>{ja ? "メンバーを選択" : "Select a team member"}</h3>
                            <Muted>{ja ? "左の一覧からスタッフを選んでください。" : "Choose someone from the directory to view their management profile."}</Muted>
                        </Placeholder>
                    ) : !person ? (
                        <Placeholder>
                            <h3>{ja ? "メンバーが見つかりません" : "Team member not found"}</h3>
                            <Muted>{ja ? "利用可能なメンバーから選択してください。" : "Select an active account from the list."}</Muted>
                            <button type="button" className="small secondary" onClick={() => onSelect(null)}>{ja ? "チーム一覧へ" : "Back to team"}</button>
                        </Placeholder>
                    ) : (
                        <>
                            <PersonHeading>
                                <button type="button" className="small hollow secondary" onClick={() => onSelect(null)}>
                                    {ja ? "← チーム一覧" : "← Team directory"}
                                </button>
                                <button type="button" className="small hollow secondary" onClick={() => onAudit(person.id)}>
                                    {ja ? "変更履歴を見る" : "View audit history"}
                                </button>
                                <PersonTitle>
                                    <Badge $large aria-hidden="true">{person.name.trim().slice(0, 1).toUpperCase() || "•"}</Badge>
                                    <div>
                                        <h3>{person.name}</h3>
                                        <Muted>{person.email}</Muted>
                                        <Muted>{person.role === "manager" ? (ja ? "マネージャー" : "Manager") : (ja ? "スタッフ" : "Staff")}</Muted>
                                    </div>
                                </PersonTitle>
                            </PersonHeading>

                            <Summary>
                                <Metric>
                                    <span>{ja ? "シフト" : "Shifts"}</span>
                                    <strong>{loading || loadError ? "—" : totals.recordedShifts}</strong>
                                </Metric>
                                <Metric>
                                    <span>{ja ? "勤務時間" : "Hours"}</span>
                                    <strong>{loading || loadError || totals.hoursSeconds === null ? "—" : hoursLabel(totals.hoursSeconds)}</strong>
                                </Metric>
                                <Metric>
                                    <span>{ja ? "スタッフドリンク" : "Staff drinks"}</span>
                                    <strong>{loading || loadError || totals.drinkCount === null ? "—" : totals.drinkCount}</strong>
                                </Metric>
                            </Summary>
                            {loading ? <Muted role="status">{ja ? "勤務記録を読み込み中…" : "Loading recorded activity…"}</Muted> : null}
                            {loadError ? (
                                <Error role="alert">
                                    {loadError}{" "}
                                    <button className="small secondary" type="button" onClick={() => setRefreshKey(key => key + 1)}>
                                        {ja ? "再試行" : "Retry"}
                                    </button>
                                </Error>
                            ) : null}
                            {!loading && !loadError ? (
                                <AdminShiftActivity
                                    key={`${person.id}:${timeScale}:${year}:${month}:${day}`}
                                    rows={periodActivity}
                                    locale={locale}
                                />
                            ) : null}
                            <Coverage>
                                {ja
                                    ? "勤務時間は打刻と確認済みの過去データを表示します。記録のない情報は推測しません。"
                                    : "Hours include clock records and verified spreadsheet history. Missing amounts are never treated as zero."}
                            </Coverage>
                            {!loading && !loadError && timeScale === "month" && canSeeChuckRevenueShare(viewer, person.id, revenueShareViewers) ? (
                                <AdminManagerShare
                                    key={person.id}
                                    person={person}
                                    month={month}
                                    locale={locale}
                                    shifts={shifts}
                                    managers={people.filter(member => member.role === "manager")}
                                    onRefresh={() => setRefreshKey(key => key + 1)}
                                    refreshVersion={refreshKey}
                                />
                            ) : null}
                            {!loading && !loadError && isStaffProfile ? (
                                <EditorDisclosure>
                                    <summary>{ja ? "勤務時間・手当を修正" : "Edit hours and bonuses"}</summary>
                                <AdminTeamEditors
                                    key={person.id + ":" + timeScale + ":" + month + ":" + year + ":" + day}
                                    person={person}
                                    locale={locale}
                                    rows={periodActivity}
                                    drinkLines={drinkLines}
                                    onRefresh={() => setRefreshKey(value => value + 1)}
                                />
                                </EditorDisclosure>
                            ) : null}
                        </>
                    )}
                </Detail>
            </Layout>
            {timeScale === "month" ? <AdminMonthlyPayOverview viewer={viewer} people={people} locale={locale}
                month={month} refreshVersion={refreshKey} /> : null}
        </Root>
    );
}

const Root = styled.section`
    display:flex;flex-direction:column;gap:var(--space-2);
    width:100%;min-width:0;
`;
const Toolbar = styled.div`
    display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-1);flex-wrap:wrap;
    h2{font-size:var(--font-size-h4);font-weight:500;}
    button{width:auto;}
`;
const PeriodNav = styled.div`
    display:flex;align-items:center;justify-content:space-between;gap:var(--space-1);
    strong{font-weight:500;}
    button{width:auto;min-width:42px;}
`;
const DayPeriodNav = styled(PeriodNav)`
    display:grid;grid-template-columns:auto minmax(0,1fr) auto;justify-items:center;
`;
const StepButton = styled.button`&&{padding-inline:1em;}`;
const RefreshRow = styled.div`
    display:flex;justify-content:flex-end;
    button{width:auto;}
`;
const EditorDisclosure = styled.details`
    padding:var(--space-1);border:1px solid var(--neutral-700);border-radius:10px;
    summary{cursor:pointer;font-weight:500;}
`;
const Layout = styled.div<{ $hasSelection: boolean }>`
    display:grid;grid-template-columns:minmax(0,1fr);gap:var(--space-2);
    & > nav{order:${({ $hasSelection }) => $hasSelection ? 2 : 1};}
    & > div{order:${({ $hasSelection }) => $hasSelection ? 1 : 2};}
    @media(min-width:1050px){grid-template-columns:minmax(230px,290px) minmax(0,1fr);align-items:start;& > nav,& > div{order:initial;}}
`;
const Directory = styled.nav`
    display:flex;flex-direction:column;gap:var(--space-1);padding:var(--space-2);
    border-radius:12px;background:var(--neutral-900);min-width:0;
`;
const DirectoryHeading = styled.h3`font-size:var(--font-size-h5);font-weight:500;`;
const Member = styled.button`
    &&{display:flex;align-items:center;gap:var(--space-1);text-align:left;width:100%;min-width:0;padding:var(--space-1);}
`;
const Badge = styled.span<{ $large?: boolean }>`
    width:${({$large})=>$large?"48px":"32px"};height:${({$large})=>$large?"48px":"32px"};
    flex-shrink:0;display:grid;place-items:center;border-radius:50%;background:var(--neutral-700);
    color:var(--neutral-100);font-weight:600;
`;
const MemberText = styled.span`
    display:flex;flex-direction:column;min-width:0;
    strong,span{overflow-wrap:anywhere;}
    span{font-size:var(--font-size-small);}
`;
const Chevron = styled.span`margin-left:auto;font-size:1.4em;`;
const Detail = styled.div`
    display:flex;flex-direction:column;gap:var(--space-2);min-width:0;
    background:var(--neutral-800);padding:var(--space-2);border-radius:12px;
`;
const Placeholder = styled.div`
    display:flex;flex-direction:column;gap:var(--space-1);padding:var(--space-2);
    button{width:auto;align-self:start;}
`;
const PersonHeading = styled.div`
    display:flex;flex-direction:column;gap:var(--space-1);
    button{width:auto;align-self:flex-start;}
`;
const PersonTitle = styled.div`
    display:flex;align-items:center;gap:var(--space-1);min-width:0;
    h3{font-size:var(--font-size-h3);font-weight:500;overflow-wrap:anywhere;}
`;
const Summary = styled.div`
    display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-1);
    @media(min-width:900px){grid-template-columns:repeat(4,minmax(0,1fr));}
`;
const Metric = styled.div`
    display:flex;flex-direction:column;gap:var(--space-0);min-width:0;
    padding:var(--space-1);background:var(--neutral-900);border-radius:8px;
    span{color:var(--neutral-300);font-size:var(--font-size-small);}
    strong{font-size:var(--font-size-h4);font-weight:600;overflow-wrap:anywhere;}
`;
const Muted = styled.p`color:var(--neutral-300);overflow-wrap:anywhere;`;
const Coverage = styled.p`
    color:var(--neutral-300);font-size:var(--font-size-small);line-height:1.5;
`;
const Error = styled.p`color:var(--danger,#e06c75);`;
