import type { Ticket } from "../types/Ticket";
import { validCollectionConfirmation } from "./paymentCollectionPolicy";

export type TicketPayment = NonNullable<Ticket["payments"]>[number];
export type PaymentDateCorrection = {
    collection_business_date: string;
    expected_collection_business_date: string | null;
    expected_collection_shift_id: number | null;
    reason: string;
};

export function correctionRequest(payment: TicketPayment, date: string, reason: string,
    serviceDate: string | null | undefined, currentDate: string): PaymentDateCorrection | null {
    if (!Number.isSafeInteger(payment.id) || (payment.id ?? 0) <= 0 || payment.voided_at != null ||
        !serviceDate || !validCollectionConfirmation(date, reason, serviceDate, currentDate) ||
        date === payment.collection_business_date || payment.collection_business_date === undefined ||
        payment.collection_shift_id === undefined) return null;
    return { collection_business_date: date, expected_collection_business_date: payment.collection_business_date,
        expected_collection_shift_id: payment.collection_shift_id, reason: reason.trim() };
}

export function correctionAudit(note: string | null | undefined): { paymentId: number; before: string | null; after: string } | null {
    try {
        const value = JSON.parse(note ?? "");
        const date = (candidate: unknown) => typeof candidate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate);
        if (!Number.isSafeInteger(value.payment_id) || value.payment_id <= 0 ||
            !(value.before?.collection_business_date === null || date(value.before?.collection_business_date)) ||
            !date(value.after?.collection_business_date)) return null;
        return { paymentId: value.payment_id, before: value.before.collection_business_date, after: value.after.collection_business_date };
    } catch { return null; }
}
