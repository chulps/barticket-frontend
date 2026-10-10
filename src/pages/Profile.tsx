import { useEffect, useState } from "react";
import styled from "styled-components";

import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ApiError, getToken } from "../api/client";
import Icon from "../components/Icon";
import { localeTag, readLocale, translate, useI18n } from "../i18n";

export default function Profile() {
    const { t, locale } = useI18n();
    const [account, setAccount] = useState<Account | null>(null);
    const [hasAccounts, setHasAccounts] = useState(true);
    const [shift, setShift] = useState<ShiftReport | null>(null);
    const [error, setError] = useState("");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [staffName, setStaffName] = useState("");
    const [staffEmail, setStaffEmail] = useState("");
    const [staffPassword, setStaffPassword] = useState("");
    const [staffRole, setStaffRole] = useState<"staff" | "manager">("staff");

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
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, []);

    async function run(action: () => Promise<void>) {
        setError("");
        try {
            await action();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : translate(readLocale(), "somethingWrong"));
        }
    }

    const clockedIn = Boolean(
        account && shift?.punches.some((punch) => punch.user_id === account.id && punch.clock_out === null),
    );

    return (
        <Page>
            <h1>{t("account")}</h1>
            {error ? <ErrorText>{error}</ErrorText> : null}

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
                        onClick={() =>
                            run(async () => {
                                const user = hasAccounts
                                    ? await accountApi.login(email, password)
                                    : await accountApi.register(name, email, password);
                                setPassword("");
                                await refresh(user);
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
                                    })
                                }
                            >
                                {t("signOut")}
                            </SignOutButton>
                        </Row>
                    </Section>

                    {account.role === "manager" ? (
                        <Section>
                            <h2>{t("addPerson")}</h2>
                            <label>
                                {t("name")}
                                <input value={staffName} onChange={(event) => setStaffName(event.target.value)} />
                            </label>
                            <label>
                                {t("email")}
                                <input value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} />
                            </label>
                            <label>
                                {t("password")}
                                <input
                                    type="password"
                                    value={staffPassword}
                                    onChange={(event) => setStaffPassword(event.target.value)}
                                />
                            </label>
                            <label>
                                {t("role")}
                                <RoleField>
                                    <select
                                        value={staffRole}
                                        onChange={(event) => setStaffRole(event.target.value as "staff" | "manager")}
                                    >
                                        <option value="staff">{t("staff")}</option>
                                        <option value="manager">{t("manager")}</option>
                                    </select>
                                    <RoleCaret>
                                        <Icon name="CaretDown" size="1em" />
                                    </RoleCaret>
                                </RoleField>
                            </label>
                            <button
                                type="button"
                                onClick={() =>
                                    run(async () => {
                                        await accountApi.createUser({
                                            name: staffName,
                                            email: staffEmail,
                                            password: staffPassword,
                                            role: staffRole,
                                        });
                                        setStaffName("");
                                        setStaffEmail("");
                                        setStaffPassword("");
                                    })
                                }
                            >
                                {t("addAccount")}
                            </button>
                        </Section>
                    ) : null}
                </>
            )}
        </Page>
    );
}

const Page = styled.main`
    width: 100%;
    max-width: 480px;
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

const RoleField = styled.span`
    position: relative;
    display: block;
    width: 100%;

    select {
        padding-right: 2.5em;
    }
`;

const RoleCaret = styled.span`
    position: absolute;
    top: 50%;
    right: 1em;
    display: flex;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--neutral-300);
    font-size: var(--font-size-default);
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
