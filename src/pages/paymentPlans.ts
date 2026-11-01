/** Future preferences only. These IDs do not configure a payment processor. */
export const paymentPlans = ["current_jms", "phone_square", "linked_jms", "advanced_stripe"] as const;
export type PaymentPlan = typeof paymentPlans[number];
export function knownPaymentPlan(value: unknown): PaymentPlan | null {
    return paymentPlans.find(plan => plan === value) ?? null;
}
