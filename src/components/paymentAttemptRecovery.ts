import type { CollectionDateConfirmation, PaymentType } from "../types/Ticket";

export type PaymentAttempt = Readonly<{
    key: string;
    method: PaymentType;
    amount: number;
    collection?: CollectionDateConfirmation;
}>;

// Tab/session memory only: no credentials, browser storage or automatic replay.
// Never evict an unresolved attempt to make room for a fresh payment key.
export function createPaymentAttemptRecovery(limit = 32) {
    const attempts = new Map<number, PaymentAttempt>();
    let session = 0;
    const uncertain = new WeakSet<PaymentAttempt>();
    return {
        session: () => session,
        markUncertain: (attempt: PaymentAttempt) => uncertain.add(attempt),
        wasUncertain: (attempt: PaymentAttempt) => uncertain.has(attempt),
        get: (ticketId: number) => attempts.get(ticketId),
        remember(ticketId: number, attempt: PaymentAttempt): PaymentAttempt | null {
            const existing = attempts.get(ticketId);
            if (existing) return existing;
            if (attempts.size >= limit) return null;
            const frozen = Object.freeze({ ...attempt, collection: attempt.collection && Object.freeze({ ...attempt.collection }) });
            attempts.set(ticketId, frozen);
            return frozen;
        },
        isCurrent: (ticketId: number, attempt: PaymentAttempt) => attempts.get(ticketId) === attempt,
        complete(ticketId: number, attempt: PaymentAttempt) {
            if (attempts.get(ticketId) === attempt) attempts.delete(ticketId);
        },
        clear: () => { attempts.clear(); session += 1; },
    };
}

export const paymentAttemptRecovery = createPaymentAttemptRecovery();
if (typeof window !== "undefined") {
    window.addEventListener("barticket-auth", paymentAttemptRecovery.clear);
    window.addEventListener("storage", event => {
        if (event.key === "barticket_token" || event.key === null) paymentAttemptRecovery.clear();
    });
}

export function verifiedRemainingBalance(ticket: { balanceDue?: number }): number | null {
    return Number.isSafeInteger(ticket.balanceDue) && ticket.balanceDue! >= 0 ? ticket.balanceDue! : null;
}

export function matchesPaymentAttempt(attempt: PaymentAttempt | undefined, key: string | undefined, method: string, amount: number | undefined, collection?: CollectionDateConfirmation): boolean {
    return Boolean(attempt && key === attempt.key && method === attempt.method && amount === attempt.amount
        && collection?.collection_business_date === attempt.collection?.collection_business_date
        && collection?.collection_date_reason === attempt.collection?.collection_date_reason);
}
