import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import styled from "styled-components";

import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ApiError } from "../api/client";
import { useI18n } from "../i18n";

/** Access is checked again by manager-only backend endpoints. */
export default function Admin() {
    const { t, locale } = useI18n();
    const [me, setMe] = useState<Account | null>(null);
    const [team, setTeam] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<"staff" | "manager">("staff");
    const [busy, setBusy] = useState(false);
    const [section, setSection] = useState<"overview" | "accounts" | "staff" | "shifts" | "history" | "payroll" | "settings">("overview");
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [managerFilter, setManagerFilter] = useState("all");
    const [sort, setSort] = useState<"date" | "revenue" | "guests">("date");
    const [expandedShift, setExpandedShift] = useState<number | null>(null);
    const [shifts, setShifts] = useState<ShiftReport[]>([]);
    const [shiftError, setShiftError] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("all");

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const account = await accountApi.me();
                if (cancelled) return;
                setMe(account);
                if (account.role === "manager") {
                    const members = await accountApi.listUsers();
                    if (!cancelled) setTeam(members);
                    try {
                        const [closed, active] = await Promise.all([accountApi.closedShifts(), accountApi.currentShift()]);
                        if (!cancelled) setShifts([...(active?.status === "open" ? [active] : []), ...closed]);
                    } catch (err) {
                        if (!cancelled) setShiftError(err instanceof ApiError ? err.message : String(err));
                    }
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof ApiError ? err.message : String(err));
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, []);

    async function perform(action: () => Promise<void>) {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            await action();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    if (loading) return <Page><h1>{locale === "ja" ? "管理" : "Admin"}</h1><p>{locale === "ja" ? "読み込み中…" : "Loading…"}</p></Page>;
    if (me?.role !== "manager") return <Navigate to="/profile" replace />;

    return (
        <Page>
            <header>
                <h1>{locale === "ja" ? "管理" : "Admin"}</h1>
                <p>{locale === "ja" ? "マネージャー専用の管理画面です。" : "Manager-only account management."}</p>
            </header>
            {error ? <ErrorText role="alert">{error}</ErrorText> : null}
            <Tabs role="tablist" aria-label={locale === "ja" ? "管理メニュー" : "Admin sections"}>
                {(["overview", "accounts", "staff", "shifts", "history", "payroll", "settings"] as const).map((key) => (
                    <button type="button" role="tab" aria-selected={section === key} key={key}
                        className={section === key ? "secondary" : "hollow secondary"}
                        onClick={() => setSection(key)}>
                        {{ overview: locale === "ja" ? "概要" : "Overview", accounts: locale === "ja" ? "アカウント" : "Accounts",
                            staff: locale === "ja" ? "スタッフ" : "Staff",
                            shifts: locale === "ja" ? "シフト" : "Shifts",
                            history: locale === "ja" ? "履歴照合" : "Reconciliation",
                            payroll: locale === "ja" ? "給与・控除" : "Payroll",
                            settings: locale === "ja" ? "設定" : "Settings" }[key]}
                    </button>
                ))}
            </Tabs>
            {section === "overview" ? (
                <>
                    <SummaryGrid>
                        {[
                            [locale === "ja" ? "アカウント数" : "Accounts", team.length],
                            [locale === "ja" ? "記録済みシフト" : "Recorded shifts", shifts.length],
                            [locale === "ja" ? "記録済み売上" : "Recorded revenue", "¥" + shifts.reduce((sum, shift) => sum + shift.paid_total, 0).toLocaleString()],
                            [locale === "ja" ? "記録済み来客数" : "Recorded guests", shifts.reduce((sum, shift) => sum + shift.guest_count, 0).toLocaleString()],
                            [locale === "ja" ? "営業状況" : "Current shift", shifts.some(shift => shift.status === "open") ? (locale === "ja" ? "営業中" : "Open") : (locale === "ja" ? "終了" : "Closed")],
                            [locale === "ja" ? "勤務中" : "Clocked in", shifts.filter(shift => shift.status === "open").flatMap(shift => shift.punches).filter(p => p.clock_out === null).length]
                        ].map(([label, value]) => <Section key={String(label)}><span>{label}</span><h2>{value}</h2></Section>)}
                    </SummaryGrid>
                    {shiftError ? <ErrorText role="alert">{shiftError}</ErrorText> : null}
                    <Section>
                        <h2>{locale === "ja" ? "管理メニュー" : "Quick access"}</h2>
                        <QuickLinks>{(["accounts", "staff", "shifts", "history", "payroll", "settings"] as const).map(key =>
                            <button key={key} type="button" className="secondary" onClick={() => setSection(key)}>
                                {{ accounts: "Accounts", staff: "Staff", shifts: "Shifts", history: "Reconciliation", payroll: "Payroll", settings: "Settings" }[key]}
                            </button>)}</QuickLinks>
                    </Section>
                    <Section><h2>{locale === "ja" ? "データについて" : "Data coverage"}</h2>
                        <p>{locale === "ja" ? "APIの記録のみを表示しています。過去の記録や担当者名は未確認の場合があります。" : "Totals include only shifts returned by the API. Historical months and recorded manager names may be incomplete until reconciliation."}</p>
                    </Section>
                </>
            ) : null}
            {section === "accounts" ? <Grid>
                <Section>
                    <h2>{t("team")}</h2>
                    {team.map((person) => (
                        <Person key={person.id}>
                            <Who>
                                <strong>{person.name}</strong>
                                <span>{person.email}</span>
                                <span>{t(person.role)}</span>
                            </Who>
                            {person.id !== me.id ? (
                                <button
                                    type="button"
                                    className="small hollow danger"
                                    disabled={busy}
                                    onClick={() => {
                                        if (!window.confirm(t("removePersonConfirm", { name: person.name }))) return;
                                        void perform(async () => setTeam(await accountApi.removeUser(person.id)));
                                    }}
                                >
                                    {t("removePerson")}
                                </button>
                            ) : null}
                        </Person>
                    ))}
                </Section>
                <Section>
                    <h2>{t("addPerson")}</h2>
                    <form onSubmit={(event) => {
                        event.preventDefault();
                        void perform(async () => {
                            await accountApi.createUser({ name, email, password, role });
                            setName("");
                            setEmail("");
                            setPassword("");
                            setRole("staff");
                            setTeam(await accountApi.listUsers());
                        });
                    }}>
                        <label>{t("name")}<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
                        <label>{t("email")}<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                        <label>{t("password")}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                        <label>{t("role")}
                            <select value={role} onChange={(event) => setRole(event.target.value as "staff" | "manager")}>
                                <option value="staff">{t("staff")}</option>
                                <option value="manager">{t("manager")}</option>
                            </select>
                        </label>
                        <button type="submit" disabled={busy}>{t("addAccount")}</button>
                    </form>
                </Section>
            </Grid> : null}
            {section === "staff" ? (
                <Section>
                    <h2>{locale === "ja" ? "スタッフ勤務実績" : "Staff activity"}</h2>
                    <p>{locale === "ja" ? "保存済みシフトの勤務時間とドリンクを表示します。打刻のない過去の勤務時間は未記録の場合があります。" : "Read-only totals from recorded shifts. Historical hours may be missing where no punches were recorded."}</p>
                    {shiftError ? <ErrorText role="alert">{shiftError}</ErrorText> : null}
                    <Filters><input aria-label="Search staff" placeholder={locale === "ja" ? "スタッフ検索" : "Search staff"} value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Role filter" value={roleFilter} onChange={event => setRoleFilter(event.target.value)}><option value="all">{locale === "ja" ? "すべて" : "All roles"}</option><option value="staff">{t("staff")}</option><option value="manager">{t("manager")}</option></select></Filters>
                    {team.filter(person => (roleFilter === "all" || person.role === roleFilter) && (person.name + " " + person.email).toLowerCase().includes(search.toLowerCase())).map((person) => {
                        const rows = shifts.flatMap(shift => shift.staff_hours.filter(row => row.user_id === person.id));
                        const seconds = rows.reduce((sum, row) => sum + row.seconds, 0);
                        const drinks = shifts.reduce((sum, shift) => sum + (shift.staff_drinks ?? []).filter(row => row.staff_id === person.id).reduce((n, row) => n + row.quantity, 0), 0);
                        return <Person key={person.id}>
                            <Who><strong>{person.name}</strong><span>{t(person.role)} · {person.email}</span></Who>
                            <strong>{rows.length ? (seconds / 3600).toFixed(1) : "—"} {locale === "ja" ? "時間" : "hours"} · {drinks} {locale === "ja" ? "杯" : "drinks"}</strong>
                        </Person>;
                    })}
                </Section>
            ) : null}
            {section === "shifts" ? (
                <Section>
                    <h2>{locale === "ja" ? "シフト履歴" : "Shift history"}</h2>
                    <p>{locale === "ja" ? "記録済みのシフトを表示します。修正機能はバックエンド対応後に追加します。" : "Read-only shift records. Editing managers, events and staffing requires backend support."}</p>
                    {shiftError ? <ErrorText role="alert">{shiftError}</ErrorText> : null}
                    <label>{locale === "ja" ? "月" : "Month"}
                        <select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}>
                            <option value="all">{locale === "ja" ? "すべて" : "All months"}</option>
                            {[...new Set(shifts.map(shift => shift.business_date.slice(0, 7)))].sort().reverse().map(month => <option key={month} value={month}>{month}</option>)}
                        </select>
                    </label>
                    <Filters><label>{locale === "ja" ? "マネージャー" : "Manager"}<select value={managerFilter} onChange={event => setManagerFilter(event.target.value)}><option value="all">{locale === "ja" ? "すべて" : "All"}</option>{[...new Set(shifts.map(shift => shift.opened_by))].filter(Boolean).sort().map(name => <option key={name} value={name}>{name}</option>)}</select></label><label>{locale === "ja" ? "並び順" : "Sort"}<select value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="date">{locale === "ja" ? "日付" : "Date"}</option><option value="revenue">{locale === "ja" ? "売上" : "Revenue"}</option><option value="guests">{locale === "ja" ? "来客数" : "Guests"}</option></select></label></Filters>
                    {shifts.filter(shift => (selectedMonth === "all" || shift.business_date.startsWith(selectedMonth)) && (managerFilter === "all" || shift.opened_by === managerFilter)).sort((a,b) => sort === "date" ? b.business_date.localeCompare(a.business_date) : sort === "revenue" ? b.paid_total - a.paid_total : b.guest_count - a.guest_count).map(shift => (
                        <ShiftRow key={shift.id}>
                            <Who>
                                <strong>{shift.business_date} · {shift.opened_by}</strong>
                                <span>{shift.status === "open" ? (locale === "ja" ? "営業中" : "Open") : (locale === "ja" ? "終了" : "Closed")} · {shift.guest_count} {locale === "ja" ? "名" : "guests"}</span>
                                <span>{shift.staff_hours.map(person => person.name + " " + (person.seconds / 3600).toFixed(1) + "h").join(", ") || (locale === "ja" ? "勤務時間未記録" : "No hours recorded")}</span>
                            </Who>
                            <button type="button" className="small hollow secondary" aria-expanded={expandedShift === shift.id} onClick={() => setExpandedShift(expandedShift === shift.id ? null : shift.id)}>¥{shift.paid_total.toLocaleString()} ▾</button>
                            {expandedShift === shift.id ? <ShiftDetails>
                                <p>{locale === "ja" ? "API登録担当者" : "Recorded manager"}: {shift.opened_by || "—"}</p>
                                <p>{locale === "ja" ? "現金" : "Cash"}: ¥{shift.cash_total.toLocaleString()} · {locale === "ja" ? "カード" : "Card"}: ¥{shift.card_total.toLocaleString()} · {locale === "ja" ? "その他" : "Other"}: ¥{shift.other_total.toLocaleString()}</p>
                                <p>{locale === "ja" ? "勤務時間" : "Recorded hours"}: {shift.staff_hours.length ? shift.staff_hours.map(row => row.name + " " + (row.seconds / 3600).toFixed(1) + "h").join(", ") : (locale === "ja" ? "未記録" : "Not recorded")}</p>
                                <p>{locale === "ja" ? "スタッフドリンク" : "Staff drinks"}: {(shift.staff_drinks ?? []).reduce((n, row) => n + row.quantity, 0)}</p>
                                <p>{locale === "ja" ? "品切れ" : "Stockouts"}: {(shift.stockouts ?? []).length}</p>
                            </ShiftDetails> : null}
                        </ShiftRow>
                    ))}
                    {!shifts.length && !shiftError ? <p>{locale === "ja" ? "記録がありません" : "No shift records yet."}</p> : null}
                </Section>
            ) : null}
            {section === "history" ? (
                <Section>
                    <h2>{locale === "ja" ? "過去データの照合" : "Historical reconciliation"}</h2>
                    <p>{locale === "ja" ? "2026年9月から2025年5月までの表計算データと照合する予定です。未確認のデータはインポートしません。" : "Planned: compare spreadsheet records against database shifts, starting with September 2026 and working back to May 2025."}</p>
                    <p>{locale === "ja" ? "過去の勤務記録は出退勤時刻ではなく合計勤務時間です。出退勤時刻は作成しません。" : "Historic staffing records contain total hours, not punch times. Do not invent clock-in or clock-out events."}</p>
                    <p>{locale === "ja" ? "照合・修正 API はまだありません。現在は読み取り専用です。" : "Matching, discrepancy review and verified import tools require backend support. No records can be changed here yet."}</p>
                </Section>
            ) : null}
            {section === "payroll" ? (
                <Section>
                    <h2>{locale === "ja" ? "給与・控除" : "Payroll & deductions"}</h2>
                    <p>{locale === "ja" ? "時給、給与前払い、イベント費用、ゲストバーテンダーへの支払い、払い戻しを管理する予定です。" : "Planned: historical hourly rates, compensation, advances, event expenses, guest bartenders and reimbursements."}</p>
                    <p>{locale === "ja" ? "給与・控除の保存先と計算ルールが未定です。金額は計算・保存されません。" : "The required payroll records and deduction rules are not available in the API. No amounts are calculated or saved."}</p>
                </Section>
            ) : null}
            {section === "settings" ? (
                <Section>
                    <h2>{locale === "ja" ? "システム設定" : "System settings"}</h2>
                    <p>{locale === "ja" ? "全体設定の管理 API は未実装です。現在の設定に変更はありません。" : "Shared configuration APIs are not yet available. No settings are changed from this screen."}</p>
                    <p>{locale === "ja" ? "各ユーザーの言語設定は既存の切替ボタンで変更できます。" : "Personal language preferences remain available from the existing language switcher."}</p>
                </Section>
            ) : null}
        </Page>
    );
}

const Page = styled.main`
    width: 100%;
    padding: var(--space-2) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    h1 { font-size: var(--font-size-h3); }
    h2 { font-size: var(--font-size-h4); font-weight: 500; }
    header p { color: var(--neutral-300); }
`;
const Grid = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
    align-items: start;
    @media (min-width: 850px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;
const Section = styled.section`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    background: var(--neutral-900);
    border-radius: 12px;
    form { display: flex; flex-direction: column; gap: var(--space-1); }
    label { display: flex; flex-direction: column; gap: var(--space-0); }
    input, select { width: 100%; box-sizing: border-box; }
    input:focus, select:focus { transform: none; }
    select { background: var(--dark); }
`;
const Person = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    button { flex-shrink: 0; width: auto; }
`;
const Who = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
    strong { font-size: var(--font-size-h4); font-weight: 500; }
    span { color: var(--neutral-300); overflow-wrap: anywhere; }
`;
const ErrorText = styled.p`color: var(--danger, #e06c75);`;

const Tabs = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-1);
    button { min-width: 0; width: 100%; }
    @media (min-width: 680px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    @media (min-width: 1050px) { grid-template-columns: repeat(6, minmax(0, 1fr)); }
`;

const SummaryGrid = styled.div`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); @media (min-width: 900px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }`;
const QuickLinks = styled.div`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-1); @media (min-width: 850px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }`;

const Filters = styled.div`display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-1); input, select { min-width: 140px; flex: 1; }`;
const ShiftRow = styled(Person)`flex-wrap: wrap; border-top: 1px solid var(--neutral-800); padding-top: var(--space-1);`;
const ShiftDetails = styled.div`width: 100%; padding: var(--space-1); background: var(--neutral-800); border-radius: 8px;`;
