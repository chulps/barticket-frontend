import { shouldPoll, subscribeRealtime } from "../api/realtime";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useMatch, useNavigate, useParams } from "react-router-dom";
import styled from "styled-components";
import RequestState from "../components/RequestState";

import { accountApi, type Account } from "../api/account";
import { ApiError, getToken } from "../api/client";
import TabGroup from "../components/TabGroup";
import { useI18n } from "../i18n";
import { confirmAccountRole } from "./adminAccountRole";
import AdminTeam from "./AdminTeam";
import AdminAuditHistory from "./AdminAuditHistory";

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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [accountsError, setAccountsError] = useState("");
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [section, setSection] = useState<"overview" | "accounts" | "team">(
        () => staffId === undefined ? "overview" : "team",
    );
    const activeSection = staffId === undefined ? section : "team";
    const selectedId = staffId === undefined ? null
        : /^[1-9][0-9]*$/.test(staffId) && Number.isSafeInteger(Number(staffId))
            ? Number(staffId) : -1;

    function chooseSection(next: "overview" | "accounts" | "team") {
        setSection(next);
        if (staffId !== undefined) navigate("/admin");
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
        // Keep the mounted forms while revalidating a healthy session. An
        // actual auth change still runs the fail-closed load above.
        async function refreshLive() {
            const request = ++generation;
            const token = getToken();
            if (!token) { void load(); return; }
            try {
                const account = await accountApi.me();
                const members = account.role === "manager" ? await accountApi.listUsers() : [];
                if (cancelled || request !== generation || getToken() !== token) return;
                setMe(account);
                setTeam(members);
                setError("");
            } catch (err) {
                if (cancelled || request !== generation || getToken() !== token) return;
                setMe(null);
                setTeam([]);
                setError(err instanceof ApiError ? err.message : String(err));
            } finally {
                if (!cancelled && request === generation && getToken() === token) setLoading(false);
            }
        }
        const unsubscribeRealtime = subscribeRealtime(["session", "users"], refreshLive);
        const poll = window.setInterval(() => { if (shouldPoll()) void refreshLive(); }, 20000);
        window.addEventListener("barticket-auth", reload);
        window.addEventListener("focus", reload);
        return () => {
            cancelled = true;
            generation++;
            unsubscribeRealtime();
            window.clearInterval(poll);
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
            <TabGroup
                tabs={[
                    { id: "overview", label: locale === "ja" ? "概要" : "Overview" },
                    { id: "accounts", label: locale === "ja" ? "アカウント" : "Accounts" },
                    { id: "team", label: locale === "ja" ? "チーム" : "Team" },
                ]}
                activeTab={activeSection}
                onChange={chooseSection}
            />
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
                            ? "アカウントタブでメンバーを追加・削除できます。チームタブでは記録の確認と未保存の編集プレビューができます。実際の給与や修正の保存にはバックエンドが必要です。"
                            : "Create and remove accounts in Accounts. Team lets you review recorded activity and draft unsaved pay/time/bonus changes; saving requires future backend APIs."}</p>
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
