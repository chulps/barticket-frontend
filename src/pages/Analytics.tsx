import { useEffect, useState } from "react";
import styled from "styled-components";

import { accountApi, type ShiftReport } from "../api/account";
import { ApiError, getToken } from "../api/client";

function hours(seconds: number) {
    const whole = Math.round(seconds / 60);
    return `${Math.floor(whole / 60)}h ${whole % 60}m`;
}

export default function Analytics() {
    const [shifts, setShifts] = useState<ShiftReport[] | null>(null);
    const [error, setError] = useState("");
    const signedIn = getToken() !== null;

    useEffect(() => {
        if (!signedIn) return;
        accountApi
            .closedShifts()
            .then(setShifts)
            .catch((err: unknown) => {
                setError(err instanceof ApiError ? err.message : "Could not load shifts");
            });
    }, [signedIn]);

    return (
        <Page>
            <h1>Analytics</h1>
            {!signedIn ? <p>Sign in from the account page to see past shifts.</p> : null}
            {error ? <p>{error}</p> : null}
            {shifts?.length === 0 ? <p>No closed shifts yet.</p> : null}
            {shifts?.map((shift) => (
                <Card key={shift.id}>
                    <h2>
                        {shift.business_date} · closed by {shift.closed_by}
                    </h2>
                    <p>
                        Paid ¥{shift.paid_total.toLocaleString()} · cash ¥{shift.cash_total.toLocaleString()} ·
                        card ¥{shift.card_total.toLocaleString()} · other ¥{shift.other_total.toLocaleString()}
                    </p>
                    <p>
                        {shift.paid_count} paid · {shift.cancelled_count} cancelled · {shift.guest_count} guests ·
                        cover ¥{shift.cover_total.toLocaleString()}
                    </p>
                    {shift.staff_hours.length > 0 ? (
                        <ul>
                            {shift.staff_hours.map((person) => (
                                <li key={person.user_id}>
                                    {person.name} · {hours(person.seconds)}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>No clock-ins.</p>
                    )}
                </Card>
            ))}
        </Page>
    );
}

const Page = styled.main`
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
`;

const Card = styled.section`
    padding: var(--space-2);
    background: var(--neutral-900);
    border-radius: 12px;
`;
