import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import styled from "styled-components";

import { accountApi, type Account } from "../api/account";
import { ApiError } from "../api/client";
import { useI18n } from "../i18n";
import { confirmAccountRole } from "./adminAccountRole";

/**
 * Phase 1: manager-only dashboard and account administration.
 * Other Admin features remain behind their later-phase backend milestones.
 * Permission checks are also enforced by the manager-only backend /users APIs.
 */
export default function Admin() {
    const { t, locale } = useI18n();
    const [me, setMe] = useState<Account | null>(null);
    const [team, setTeam] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [accountsError, setAccountsError] = useState("");
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [section, setSection] = useState<"overview" | "accounts">("overview");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<"staff" | "manager">("staff");

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const account = await accountApi.me();
                if (cancelled) return;
                setMe(account);
                if (account.role === "manager") {
                    try {
                        const members = await accountApi.listUsers();
                        if (!cancelled) setTeam(members);
                    } catch (err) {
                        if (!cancelled) setAccountsError(err instanceof ApiError ? err.message : String(err));
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

    async function refreshAccounts() {
        if (accountsLoading) return;
        setAccountsLoading(true);
        setAccountsError("");
        try {
            setTeam(await accountApi.listUsers());
        } catch (err) {
            setAccountsError(err instanceof ApiError ? err.message : String(err));
        } finally {
            setAccountsLoading(false);
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

    if (loading) return <Page><h1>{locale === "ja" ? "管理" : "Admin"}</h1><p>{t("loading")}</p></Page>;
    if (!me && error) return (
        <Page>
            <h1>{locale === "ja" ? "管理" : "Admin"}</h1>
            <ErrorText role="alert">{error}</ErrorText>
            <button type="button" className="small secondary" onClick={() => window.location.reload()}>
                {locale === "ja" ? "再試行" : "Retry"}
            </button>
        </Page>
    );
    if (me?.role !== "manager") return <Navigate to="/profile" replace />;

    return (
        <Page>
            <header>
                <h1>{locale === "ja" ? "管理" : "Admin"}</h1>
                <p>{locale === "ja" ? "管理者向けのアカウント管理画面です。" : "Manager-only account management."}</p>
            </header>
            {error ? <ErrorText role="alert">{error}</ErrorText> : null}
            <Tabs role="tablist" aria-label={locale === "ja" ? "管理メニュー" : "Admin sections"}>
                {(["overview", "accounts"] as const).map((key) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={section === key}
                        className={section === key ? "secondary" : "hollow secondary"}
                        onClick={() => setSection(key)}
                    >
                        {key === "overview"
                            ? (locale === "ja" ? "概要" : "Overview")
                            : (locale === "ja" ? "アカウント" : "Accounts")}
                    </button>
                ))}
            </Tabs>
            {section === "overview" ? (
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
                            ? "アカウントタブでメンバーを追加・削除できます。スタッフ管理、シフト管理、給与、設定は今後のフェーズで追加します。"
                            : "Create and remove team accounts in the Accounts tab. Staff records, shift management, payroll and settings will be added in later phases."}</p>
                        <button type="button" className="small secondary" onClick={() => setSection("accounts")}>
                            {locale === "ja" ? "アカウントを表示" : "View accounts"}
                        </button>
                    </Section>
                </>
            ) : (
                <Grid>
                    <Section>
                        <h2>{t("team")} ({accountsError ? "—" : team.length})</h2>
                        <p>{locale === "ja"
                            ? "現在の登録アカウントを表示します。過去のスタッフ記録や無効化されたアカウントは含まれません。"
                            : "Only accounts currently returned by the API are shown. Historical and deactivated accounts are not included."}</p>
                        {accountsError ? <ErrorText role="alert">{accountsError}</ErrorText> : null}
                        <button type="button" className="small hollow secondary" disabled={accountsLoading || busy} onClick={() => void refreshAccounts()}>
                            {locale === "ja" ? "一覧を更新" : "Refresh accounts"}
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
const Tabs = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-1);
    button { min-width: 0; width: 100%; }
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
