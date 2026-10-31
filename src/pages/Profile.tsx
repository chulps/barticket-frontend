import { useEffect, useState } from "react";
import styled from "styled-components";
import RequestState from "../components/RequestState";
import { useNavigate, useSearchParams } from "react-router-dom";

import { accountApi, type Account } from "../api/account";
import { ApiError, getToken } from "../api/client";
import { readLocale, translate, useI18n } from "../i18n";
import TabGroup from "../components/TabGroup";
import ShiftControls from "./ShiftControls";
import StaffWorkHistory from "./StaffWorkHistory";
import StaffIncome from "./StaffIncome";

type ProfileView = "pay" | "history" | "shift" | "account";

export default function Profile() {
    const { t, locale } = useI18n();
    const navigate = useNavigate();
    const [account, setAccount] = useState<Account | null>(null);
    const [hasAccounts, setHasAccounts] = useState(true);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedView = searchParams.get("section");
    const view: ProfileView = requestedView === "history" || requestedView === "shift" || requestedView === "account" ? requestedView : "pay";
    function setView(next: ProfileView) {
        setSearchParams(previous => {
            const params = new URLSearchParams(previous);
            if (next === "pay") params.delete("section");
            else params.set("section", next);
            return params;
        });
    }

    async function refresh(next?: Account | null) {
        const current = next === undefined ? account : next;
        if (!getToken()) {
            setAccount(null);
            const status = await accountApi.status();
            setHasAccounts(status.has_accounts);
            return;
        }
        const me = current ?? (await accountApi.me());
        setAccount(me);
    }

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                if (!getToken()) {
                    const status = await accountApi.status();
                    if (!cancelled) setHasAccounts(status.has_accounts);
                    return;
                }
                const me = await accountApi.me();
                if (!cancelled) {
                    setAccount(me);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof ApiError ? err.message : translate(readLocale(), "couldNotLoadAccount"));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, []);

    async function run(action: () => Promise<void>) {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            await action();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : translate(readLocale(), "somethingWrong"));
        } finally {
            setBusy(false);
        }
    }

    if (loading) return <Page $signedIn={false}><h1>{t("account")}</h1><RequestState kind="loading" detail={locale === "ja" ? "アカウントを読み込み中…" : "Loading account…"} /></Page>;
    // A failed authenticated lookup is not a signed-out session. Avoid showing
    // login/manager-registration forms until the auth state can be verified.
    if (getToken() && !account && error) return <Page $signedIn={false}>
        <h1>{t("account")}</h1>
        <RequestState kind="error" detail={error} onRetry={() => window.location.reload()} />
    </Page>;

    return (
        <Page $signedIn={Boolean(account)}>
            <h1>{account ? (locale === "ja" ? "プロフィール" : "Profile") : t("account")}</h1>
            {error ? <ErrorText role="alert">{error}</ErrorText> : null}
            {error && !account ? <button type="button" className="small hollow secondary" onClick={() => window.location.reload()}>{locale === "ja" ? "再試行" : "Retry"}</button> : null}

            {!account ? (
                <Section>
                    <h2>{hasAccounts ? t("signIn") : t("createManager")}</h2>
                    {!hasAccounts ? (
                        <label>
                            {t("name")}
                            <input value={name} onChange={(event) => setName(event.target.value)} />
                        </label>
                    ) : null}
                    <label>
                        {t("email")}
                        <input value={email} onChange={(event) => setEmail(event.target.value)} />
                    </label>
                    <label>
                        {t("password")}
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    </label>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            run(async () => {
                                const user = hasAccounts
                                    ? await accountApi.login(email, password)
                                    : await accountApi.register(name, email, password);
                                setPassword("");
                                await refresh(user);
                                navigate("/tickets", { replace: true });
                            })
                        }
                    >
                        {hasAccounts ? t("signIn") : t("createAccount")}
                    </button>
                </Section>
            ) : (
                <>
                    <TabGroup<ProfileView>
                        label={locale === "ja" ? "プロフィール表示" : "Profile sections"}
                        activeTab={view}
                        onChange={setView}
                        tabs={[
                            { id: "pay", label: locale === "ja" ? "給与" : "My pay" },
                            { id: "history", label: locale === "ja" ? "勤務履歴" : "Work history" },
                            { id: "shift", label: locale === "ja" ? "勤務" : "Shift" },
                            { id: "account", label: locale === "ja" ? "アカウント設定" : "Account settings" },
                        ]}
                    />

                    {view === "pay" ? <StaffIncome key={account.id} userId={account.id} locale={locale} role={account.role} /> : null}
                    {view === "history" ? <StaffWorkHistory key={account.id} userId={account.id} locale={locale} /> : null}
                    {view === "shift" ? <ShiftControls account={account} locale={locale} /> : null}

                    {view === "account" ? <Section aria-label={locale === "ja" ? "アカウント設定" : "Account settings"}>
                        <h2>{locale === "ja" ? "アカウント設定" : "Account settings"}</h2>
                        <Who>
                            <strong>{account.name}</strong>
                            <span>{account.email}</span>
                            <span>{t(account.role)}</span>
                        </Who>
                        <label>
                            {t("name")}
                            <input
                                defaultValue={account.name}
                                onBlur={(event) => {
                                    const next = event.target.value.trim();
                                    if (next && next !== account.name) {
                                        run(async () => {
                                            const updated = await accountApi.updateMe({ name: next });
                                            setAccount(updated);
                                        });
                                    }
                                }}
                            />
                        </label>
                        <label>
                            {t("newPassword")}
                            <input
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                            />
                        </label>
                        <Row>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() =>
                                    run(async () => {
                                        await accountApi.updateMe({ password });
                                        setPassword("");
                                    })
                                }
                            >
                                {t("savePassword")}
                            </button>
                            <SignOutButton
                                type="button"
                                className="hollow"
                                onClick={() =>
                                    run(async () => {
                                        await accountApi.logout();
                                        setPassword("");
                                        await refresh(null);
                                        navigate("/", { replace: true });
                                    })
                                }
                            >
                                {t("signOut")}
                            </SignOutButton>
                        </Row>
                    </Section> : null}

                </>
            )}
        </Page>
    );
}

const Page = styled.main<{ $signedIn: boolean }>`
    width: 100%;
    max-width: ${({ $signedIn }) => $signedIn ? "960px" : "480px"};
    padding: var(--space-2) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);

    @media (max-width: 600px) {
        > [role="group"] {
            overflow: visible;
        }
        > [role="group"] > div {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
            min-width: 0;
        }
        > [role="group"] > div > div { display: none; }
        > [role="group"] button {
            min-width: 0;
            white-space: normal;
        }
        > [role="group"] button[aria-pressed="true"] {
            background: var(--neutral-800);
        }
    }

    h1 {
        font-size: var(--font-size-h3);
    }

    h2 {
        font-size: var(--font-size-h4);
        font-weight: 500;
    }

`;

const Section = styled.section`
    width: 100%;
    max-width: 580px;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    background: var(--neutral-900);
    border-radius: 12px;

    label {
        display: flex;
        flex-direction: column;
        gap: var(--space-0);
        letter-spacing: 0.04em;
    }

    input,
    select {
        width: 100%;
        box-sizing: border-box;
    }

    input:focus,
    select:focus {
        transform: none;
    }

    select {
        background: var(--dark);
    }
`;

const SignOutButton = styled.button`
    &&,
    &&:hover {
        outline: 1px solid var(--danger-500);
        outline-offset: -1px;
    }
`;

const Who = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong {
        font-size: var(--font-size-h4);
        font-weight: 500;
    }

    span {
        color: var(--neutral-300);
        overflow-wrap: anywhere;
    }
`;

const Row = styled.div`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);

    button {
        width: 100%;
    }

    @media (min-width: 640px) {
        flex-direction: row;

        button {
            flex: 1;
        }
    }
`;

const ErrorText = styled.p`
    color: var(--danger, #e06c75);
`;
