import { useEffect, useState } from "react";
import styled from "styled-components";

import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ApiError, getToken } from "../api/client";

export default function Profile() {
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
                    setError(err instanceof ApiError ? err.message : "Could not load the account");
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
            setError(err instanceof ApiError ? err.message : "Something went wrong");
        }
    }

    const clockedIn = Boolean(
        account && shift?.punches.some((punch) => punch.user_id === account.id && punch.clock_out === null),
    );

    return (
        <Page>
            <h1>Account</h1>
            {error ? <ErrorText>{error}</ErrorText> : null}

            {!account ? (
                <Section>
                    <h2>{hasAccounts ? "Sign in" : "Create the manager account"}</h2>
                    {!hasAccounts ? (
                        <label>
                            Name
                            <input value={name} onChange={(event) => setName(event.target.value)} />
                        </label>
                    ) : null}
                    <label>
                        Email
                        <input value={email} onChange={(event) => setEmail(event.target.value)} />
                    </label>
                    <label>
                        Password
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
                        {hasAccounts ? "Sign in" : "Create account"}
                    </button>
                </Section>
            ) : (
                <>
                    <Section>
                        <p>
                            {account.name} · {account.email} · {account.role}
                        </p>
                        <label>
                            Name
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
                            New password
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
                                Save password
                            </button>
                            <button
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
                                Sign out
                            </button>
                        </Row>
                    </Section>

                    <Section>
                        <h2>Tonight</h2>
                        {shift?.status === "open" ? (
                            <p>
                                Shift open since{" "}
                                {new Date(shift.opened_at * 1000).toLocaleTimeString("en-JP", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                })}{" "}
                                by {shift.opened_by}
                            </p>
                        ) : (
                            <p>No shift is open.</p>
                        )}
                        <Row>
                            {shift?.status !== "open" ? (
                                <button type="button" onClick={() => run(async () => setShift(await accountApi.openShift()))}>
                                    Open shift
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
                                        {clockedIn ? "Clock out" : "Clock in"}
                                    </button>
                                    <button
                                        type="button"
                                        className="danger"
                                        onClick={() => run(async () => setShift(await accountApi.closeShift()))}
                                    >
                                        Close shift
                                    </button>
                                </>
                            )}
                        </Row>
                        {shift?.status === "closed" ? (
                            <p>
                                Shift closed.
                                {account.role === "manager"
                                    ? ` Paid ¥${shift.paid_total.toLocaleString()} · cash ¥${shift.cash_total.toLocaleString()} · card ¥${shift.card_total.toLocaleString()}`
                                    : ""}
                            </p>
                        ) : null}
                    </Section>

                    {account.role === "manager" ? (
                        <Section>
                            <h2>Add a person</h2>
                            <label>
                                Name
                                <input value={staffName} onChange={(event) => setStaffName(event.target.value)} />
                            </label>
                            <label>
                                Email
                                <input value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} />
                            </label>
                            <label>
                                Password
                                <input
                                    type="password"
                                    value={staffPassword}
                                    onChange={(event) => setStaffPassword(event.target.value)}
                                />
                            </label>
                            <label>
                                Role
                                <select
                                    value={staffRole}
                                    onChange={(event) => setStaffRole(event.target.value as "staff" | "manager")}
                                >
                                    <option value="staff">Staff</option>
                                    <option value="manager">Manager</option>
                                </select>
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
                                Add account
                            </button>
                        </Section>
                    ) : null}
                </>
            )}
        </Page>
    );
}

const Page = styled.main`
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: 28rem;
`;

const Section = styled.section`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
`;

const Row = styled.div`
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
`;

const ErrorText = styled.p`
    color: var(--danger, #e06c75);
`;
