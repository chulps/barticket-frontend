import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import styled from "styled-components";

import { accountApi, type Account } from "../api/account";
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
            <Grid>
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
            </Grid>
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
