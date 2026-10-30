import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useMatch, useNavigate, useParams } from "react-router-dom";
import styled from "styled-components";
import RequestState from "../components/RequestState";

import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ApiError, getToken } from "../api/client";
import { useI18n } from "../i18n";
import { confirmAccountRole } from "./adminAccountRole";
import AdminTeam from "./AdminTeam";
import DataDownload from "../components/DataDownload";
import AdminAuditHistory from "./AdminAuditHistory";
import Reconciliation from "./Reconciliation";
import ScheduleImport from "./ScheduleImport";
import AdminPayDeductions from "./AdminPayDeductions";

type AdminSection = "overview" | "accounts" | "team" | "historicalHours" | "schedules" | "adjustments";

const adminSectionTabs: { id: AdminSection; label: { en: string; ja: string } }[] = [
    { id: "overview", label: { en: "Overview", ja: "概要" } },
    { id: "accounts", label: { en: "Accounts", ja: "アカウント" } },
    { id: "team", label: { en: "Team", ja: "チーム" } },
    { id: "historicalHours", label: { en: "Historical hours", ja: "履歴勤務時間" } },
    { id: "schedules", label: { en: "Schedules", ja: "シフト予定" } },
    { id: "adjustments", label: { en: "Pay deductions", ja: "報酬控除" } },
];

/**
 * Manager-only dashboard: Phase 1 accounts plus frontend-only Team editor previews.
 * Role access is checked via /auth/me before rendering any team view.
 * All privileged account writes are additionally enforced by backend /users APIs.
 * Team rate/time/drinkback controls never write to the backend.
 */
export default function Admin() {
    const { t, locale } = useI18n();
    const navigate = useNavigate();
    const { staffId } = useParams<{ staffId: string }>();
    const auditRoute = useMatch("/admin/staff/:staffId/audit");
    const [me, setMe] = useState<Account | null>(null);
    const [team, setTeam] = useState<Account[]>([]);
    const [historicalShifts, setHistoricalShifts] = useState<ShiftReport[]>([]);
    const [historicalLoading, setHistoricalLoading] = useState(false);
    const [historicalError, setHistoricalError] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [accountsError, setAccountsError] = useState("");
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [section, setSection] = useState<AdminSection>(
        () => staffId === undefined ? "overview" : "team",
    );
    const activeSection = staffId === undefined ? section : "team";
    const selectedId = staffId === undefined ? null
        : /^[1-9][0-9]*$/.test(staffId) && Number.isSafeInteger(Number(staffId))
            ? Number(staffId) : -1;

    function chooseSection(next: AdminSection) {
        setSection(next);
        if (staffId !== undefined) navigate("/admin");
        if (next === "historicalHours") void loadHistoricalShifts();
    }

    async function loadHistoricalShifts() {
        if (historicalLoading || me?.role !== "manager") return;
        const token = getToken();
        if (!token) return;
        setHistoricalLoading(true);
        setHistoricalError("");
        try {
            setHistoricalShifts(await accountApi.closedShifts());
        } catch (err) {
            if (getToken() === token) {
                setHistoricalShifts([]);
                setHistoricalError(err instanceof ApiError ? err.message : String(err));
            }
        } finally {
            if (getToken() === token) setHistoricalLoading(false);
        }
    }

    function chooseMember(id: number | null) {
        setSection("team");
        navigate(id === null ? "/admin" : `/admin/staff/${id}`);
    }
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<"staff" | "manager">("staff");

    useEffect(() => {
        let cancelled = false;
        let generation = 0;
        async function load() {
            const request = ++generation;
            const token = getToken();
            // Fail closed while checking the current session; never show
            // another account's cached manager, team, or payroll draft data.
            setLoading(true);
            setMe(null);
            setTeam([]);
            setAccountsError("");
            setError("");
            if (!token) { setLoading(false); return; }
            try {
                const account = await accountApi.me();
                if (cancelled || request !== generation || getToken() !== token) return;
                if (account.role !== "manager") { setMe(account); return; }
                const members = await accountApi.listUsers();
                if (cancelled || request !== generation || getToken() !== token) return;
                setTeam(members);
                setMe(account);
            } catch (err) {
                if (cancelled || request !== generation || getToken() !== token) return;
                setTeam([]);
                setMe(null);
                setError(err instanceof ApiError ? err.message : String(err));
            } finally {
                if (!cancelled && request === generation && getToken() === token) setLoading(false);
            }
        }
        const reload = () => { void load(); };
        void load();
        window.addEventListener("barticket-auth", reload);
        window.addEventListener("focus", reload);
        return () => {
            cancelled = true;
            generation++;
            window.removeEventListener("barticket-auth", reload);
            window.removeEventListener("focus", reload);
        };
    }, []);

    async function refreshAccounts() {
        if (accountsLoading || me?.role !== "manager") return;
        const token = getToken();
        if (!token) return;
        setAccountsLoading(true);
        setAccountsError("");
        try {
            const members = await accountApi.listUsers();
            if (getToken() === token) setTeam(members);
        } catch (err) {
            if (getToken() === token) {
                setTeam([]);
                setAccountsError(err instanceof ApiError ? err.message : String(err));
            }
        } finally {
            if (getToken() === token) setAccountsLoading(false);
        }
    }

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

    function createAccount(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        // Existing backend policy allows managers to create more managers.
        // Require an explicit acknowledgement before granting Admin privileges.
        if (!confirmAccountRole(role, locale, (message) => window.confirm(message))) return;
        void perform(async () => {
            await accountApi.createUser({ name: name.trim(), email: email.trim(), password, role });
            setName("");
            setEmail("");
            setPassword("");
            setRole("staff");
            setTeam(await accountApi.listUsers());
        });
    }

    if (loading) return <Page><h1>{locale === "ja" ? "管理" : "Admin"}</h1><RequestState kind="loading" detail={t("loading")} /></Page>;
    if (!me && error) return (
        <Page>
            <h1>{locale === "ja" ? "管理" : "Admin"}</h1>
            <RequestState kind="error" detail={error} onRetry={() => window.location.reload()} />
        </Page>
    );
    if (me?.role !== "manager") return <Navigate to="/profile" replace />;

    if (auditRoute) {
        const person = team.find(member => member.id === selectedId);
        if (!person) return (
            <Page>
                <h1>{locale === "ja" ? "変更履歴" : "Audit history"}</h1>
                <ErrorText role="alert">{accountsError || (locale === "ja" ? "メンバーが見つかりません" : "Team member not found")}</ErrorText>
                <button type="button" className="small secondary" onClick={() => navigate("/admin")}>
                    {locale === "ja" ? "チームに戻る" : "Back to Admin"}
                </button>
            </Page>
        );
        return <AdminAuditHistory person={person} locale={locale}
            onBack={() => navigate("/admin/staff/" + person.id)} />;
    }

    return (
        <Page>
            <header>
                <h1>{locale === "ja" ? "管理" : "Admin"}</h1>
                <p>{locale === "ja" ? "管理者向けのアカウント管理画面です。" : "Manager-only account management."}</p>
            </header>
            {error ? <ErrorText role="alert">{error}</ErrorText> : null}
            <SectionNav aria-label={locale === "ja" ? "管理セクション" : "Admin sections"}>
                {adminSectionTabs.map(tab => <SectionButton
                    key={tab.id} type="button" aria-pressed={activeSection === tab.id}
                    $active={activeSection === tab.id} onClick={() => chooseSection(tab.id)}>
                    {locale === "ja" ? tab.label.ja : tab.label.en}
                </SectionButton>)}
            </SectionNav>
            {activeSection === "overview" ? (
                <>
                    <SummaryGrid>
                        <Section>
                            <span>{locale === "ja" ? "登録アカウント数" : "Active accounts"}</span>
                            <strong>{accountsError ? "—" : team.length}</strong>
                        </Section>
                        <Section>
                            <span>{locale === "ja" ? "スタッフ" : "Staff"}</span>
                            <strong>{accountsError ? "—" : team.filter(person => person.role === "staff").length}</strong>
                        </Section>
                        <Section>
                            <span>{locale === "ja" ? "マネージャー" : "Managers"}</span>
                            <strong>{accountsError ? "—" : team.filter(person => person.role === "manager").length}</strong>
                        </Section>
                    </SummaryGrid>
                    {accountsError ? <ErrorText role="alert">{accountsError}</ErrorText> : null}
                    <Section>
                        <h2>{locale === "ja" ? "アカウント管理" : "Manage accounts"}</h2>
                        <p>{locale === "ja"
                            ? "アカウントタブではメンバーを管理し、チームタブでは勤務記録、給与見積もり、時給、打刻修正、ドリンク手当を確認できます。保存された変更は監査履歴に記録されます。給与の金額は支払記録ではありません。"
                            : "Manage accounts, review team activity and pay estimates, and update hourly rates, clock corrections and drink bonuses in Team. Saved changes appear in the audit history. Pay amounts are estimates, not payment records."}</p>
                        <button type="button" className="small secondary" onClick={() => chooseSection("accounts")}>
                            {locale === "ja" ? "アカウントを表示" : "View accounts"}
                        </button>
                    </Section>
                </>
            ) : activeSection === "accounts" ? (
                <Grid>
                    <Section>
                        <h2>{t("team")} ({accountsError ? "—" : team.length})</h2>
                        <p>{locale === "ja"
                            ? "現在の登録アカウントを表示します。過去のスタッフ記録や無効化されたアカウントは含まれません。"
                            : "Only accounts currently returned by the API are shown. Historical and deactivated accounts are not included."}</p>
                        <DataDownload locale={locale} scope="admin" />
                        {accountsError ? <ErrorText role="alert">{accountsError}</ErrorText> : null}
                        <button type="button" className="small hollow secondary" disabled={accountsLoading || busy} onClick={() => void refreshAccounts()}>
                            {accountsLoading ? (locale === "ja" ? "更新中…" : "Refreshing…") : (locale === "ja" ? "一覧を更新" : "Refresh accounts")}
                        </button>
                        {!team.length && !accountsError ? <p>{locale === "ja" ? "登録アカウントがありません。" : "No accounts were returned."}</p> : null}
                        {team.map(person => (
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
                        <form onSubmit={createAccount}>
                            <label>{t("name")}<input required maxLength={255} value={name} onChange={event => setName(event.target.value)} /></label>
                            <label>{t("email")}<input required maxLength={255} type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
                            <label>{t("password")}<input type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>
                            <label>{t("role")}
                                <select value={role} onChange={event => setRole(event.target.value as "staff" | "manager")}>
                                    <option value="staff">{t("staff")}</option>
                                    <option value="manager">{t("manager")}</option>
                                </select>
                            </label>
                            {role === "manager" ? (
                                <Warning role="status">
                                    {locale === "ja"
                                        ? "マネージャーにはアカウント管理を含むすべての管理者権限が付与されます。信頼できる人にのみ付与してください。"
                                        : "Managers can access Admin and manage other accounts. Assign this role only to trusted people."}
                                </Warning>
                            ) : null}
                            <button type="submit" disabled={busy}>{t("addAccount")}</button>
                        </form>
                    </Section>
                </Grid>
            ) : activeSection === "historicalHours" ? (
                <>
                    <Section>
                        <h2>{locale === "ja" ? "履歴勤務時間" : "Historical staff hours"}</h2>
                        <p>{locale === "ja" ? "月ごとの勤務合計を既存の打刻と照合します。履歴データは打刻時刻として保存されません。" : "Reconcile monthly staff-hour totals against recorded punches. Historical totals are never stored as clock times."}</p>
                    </Section>
                    {historicalLoading ? <RequestState kind="loading" detail={t("loading")} /> : (
                        <Reconciliation shifts={historicalShifts} users={team} locale={locale} error={historicalError} />
                    )}
                </>
            ) : activeSection === "schedules" ? (
                <>
                    <Section>
                        <h2>{locale === "ja" ? "勤務表のシフト予定" : "Spreadsheet shift schedules"}</h2>
                        <p>{locale === "ja"
                            ? "未来の勤務割当と元の出典を確認して取り込みます。実際のシフトや勤務時間は作成されません。"
                            : "Review and import assigned dates with their spreadsheet source. This records planned assignments without creating shifts or worked hours."}</p>
                    </Section>
                    <ScheduleImport users={team} locale={locale} />
                </>
            ) : activeSection === "adjustments" ? (
                <AdminPayDeductions managers={team.filter(person => person.role === "manager")} locale={locale} />
            ) : (
                <AdminTeam
                    viewer={me}
                    people={team}
                    accountsError={accountsError}
                    locale={locale}
                    selectedId={selectedId}
                    onSelect={chooseMember}
                    onAudit={(id) => navigate("/admin/staff/" + id + "/audit")}
                />
            )}
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
const SectionNav = styled.nav`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-0);
    padding: var(--space-0);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-1);
    @media (min-width: 640px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    @media (min-width: 1000px) { grid-template-columns: repeat(6, minmax(0, 1fr)); }
`;
const SectionButton = styled.button<{ $active: boolean }>`
    min-width: 0;
    min-height: 48px;
    padding: var(--space-1);
    border: 1px solid transparent;
    border-radius: calc(var(--space-1) - 2px);
    background: ${({ $active }) => $active ? "var(--neutral-800)" : "transparent"};
    color: ${({ $active }) => $active ? "white" : "var(--neutral-300)"};
    overflow-wrap: anywhere;
    text-align: center;
    &:hover { color: white; }
    &:focus-visible { outline: 2px solid var(--royal-400); outline-offset: 1px; }
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
    strong { font-family: var(--font-family-data); }
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
const SummaryGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: var(--space-2);
    @media (min-width: 720px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    strong { display: block; font-size: var(--font-size-h4); }
`;
const ErrorText = styled.p`color: var(--danger, #e06c75);`;
const Warning = styled.p`color: var(--danger-400); font-size: var(--font-size-small);`;
