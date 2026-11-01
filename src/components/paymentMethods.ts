import type { PaymentType } from "../types/Ticket";
import { translations, type Locale } from "../i18n/translations";

export const paymentMethodTypes = ["cash", "card", "paypay", "other"] as const satisfies readonly PaymentType[];

// Display unknown historical methods safely without changing their stored value.
export function paymentMethodLabel(method: string, locale: Locale): string {
    const key = paymentMethodTypes.find(value => value === method) ?? "other";
    return translations[locale][key];
}
