import { useEffect, useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";

import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ApiError, getToken } from "../api/client";
import { localeTag, readLocale, translate, useI18n } from "../i18n";
import StaffWorkHistory from "./StaffWorkHistory";

export default function Profile() {
    const { t, locale } = useI18n();
    const navigate = useNavigate();
    const [account, setAccount] = useState<Account | null>(null);
    const [hasAccounts, setHasAccounts] = useState(true);
    const [shift, setShift] = useState<ShiftReport | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    async function refresh(next?: Account | null) {
        const current = next === undefined ? account : next;
        if (!getToken()) {
            setAccount(null);
            setShift(null);
            const status = await accountApi.status();
            setHasAccounts(status.has_accounts);
            return;
        }
        const me = current ?? (await accountApi.me());
        setAccount(me);
        setShift(await accountApi.currentShift());
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
                const current = await accountApi.currentShift();
                if (!cancelled) {
                    setAccount(me);
                    setShift(current);
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

    const clockedIn = Boolean(
        account && shift?.punches.some((punch) => punch.user_id === account.id && punch.clock_out === null),
    );

    if (loading) return <Page $signedIn={false}><h1>{t("account")}</h1><p role="status" aria-live="polite">{locale === "ja" ? "アカウントを読み込み中…" : "Loading account…"}</p></Page>;
    // A failed authenticated lookup is not a signed-out session. Avoid showing
    // login/manager-registration forms until the auth state can be verified.
    if (getToken() && !account && error) return <Page $signedIn={false}>
        <h1>{t("account")}</h1>
        <ErrorText role="alert">{error}</ErrorText>
        <button type="button" className="small hollow secondary" onClick={() => window.location.reload()}>
            {locale === "ja" ? "再試行" : "Retry"}
        </button>
    </Page>;

    return (
        <Page $signedIn={Boolean(account)}>
            <h1>{t("account")}</h1>
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
                    <Section>
                        <h2>{t("tonight")}</h2>
                        {shift?.status === "open" ? (
                            <p>
                                {t("shiftOpenSince", {
                                    time: new Date(shift.opened_at * 1000).toLocaleTimeString(localeTag(locale), {
                                        hour: "numeric",
                                        minute: "2-digit",
                                    }),
                                    name: shift.opened_by,
                                })}
                            </p>
                        ) : (
                            <p>{t("noShiftOpen")}</p>
                        )}
                        <Row>
                            {shift?.status !== "open" ? (
                                <button type="button" className="success" onClick={() => run(async () => setShift(await accountApi.openShift()))}>
                                    {t("openShift")}
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className="secondary"
                                        onClick={() =>
                                            run(async () =>
                                                setShift(clockedIn ? await accountApi.clockOut() : await accountApi.clockIn()),
                                            )
                                        }
                                    >
                                        {clockedIn ? t("clockOut") : t("clockIn")}
                                    </button>
                                    <button
                                        type="button"
                                        className="danger"
                                        onClick={() => run(async () => setShift(await accountApi.closeShift()))}
                                    >
                                        {t("closeShift")}
                                    </button>
                                </>
                            )}
                        </Row>
                        {shift?.status === "closed" ? (
                            <p>
                                {t("shiftClosed")}
                                {account.role === "manager"
                                    ? ` ${t("shiftClosedTotals", {
                                          total: shift.paid_total.toLocaleString(),
                                          cash: shift.cash_total.toLocaleString(),
                                          card: shift.card_total.toLocaleString(),
                                      })}`
                                    : ""}
                            </p>
                        ) : null}
                    </Section>

                    <StaffWorkHistory key={account.id} userId={account.id} locale={locale} />

                    <Section>
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
                    </Section>

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
