// src/components/PaymentModal.tsx

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ApiError } from "../api/client";
import { businessDateJst } from "../pages/shiftControlPolicy";
import { isPreviousServiceDate, validCollectionConfirmation } from "./paymentCollectionPolicy";
import { paymentAttemptRecovery, verifiedRemainingBalance } from "./paymentAttemptRecovery";
import { nextSelectorIndex } from "./selectorNavigation";
import styled from "styled-components";

import { useModal } from "../hooks/useModal";
import type { CollectionDateConfirmation, PaymentType, Ticket } from "../types/Ticket";

import Icon from "../components/Icon"
import { useI18n, type MessageKey } from "../i18n";

type IconName = React.ComponentProps<typeof Icon>["name"];

type PaymentModalProps = {
    ticket: Ticket;
    canConfirmCollectionDate?: boolean;
    onConfirm: (paymentType: PaymentType, amount: number, idempotencyKey?: string, collection?: CollectionDateConfirmation) => Promise<Ticket | null>;
};


const paymentMethods = [
  {
    type: "cash",
    label: "cash",
    icon: "Money",
  },
  {
    type: "card",
    label: "card",
    icon: "CreditCard",
  },
  {
    type: "paypay",
    label: "paypay",
    icon: "Wallet",
  },
  {
    type: "other",
    label: "other",
    icon: "Wallet",
  },
] as const satisfies {
  type: PaymentType;
  label: MessageKey;
  icon: IconName;
}[];

export default function PaymentModal({
    ticket,
    onConfirm,
    canConfirmCollectionDate = false,
}: PaymentModalProps) {
    const { closeModal, registerCloseGuard } = useModal();
    const [recovered] = useState(() => paymentAttemptRecovery.get(ticket.id));
    const mounted = useRef(true);
    const resolved = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const { t, locale } = useI18n();

    const [paymentType, setPaymentType] =
        useState<PaymentType>(recovered?.method ?? "cash");

    const [step, setStep] =
        useState<"select" | "success">("select");
    const pending = useRef(false);
    const methodButtons = useRef<(HTMLButtonElement | null)[]>([]);
    function handleMethodArrow(event: KeyboardEvent<HTMLButtonElement>, index: number) {
        if (saving || attempted) return;
        const next = nextSelectorIndex(index, paymentMethods.length, event.key);
        if (next === null) return;
        event.preventDefault();
        setPaymentType(paymentMethods[next].type);
        methodButtons.current[next]?.focus();
    }
    const [saving, setSaving] = useState(false);
    const [attempted, setAttempted] = useState(Boolean(recovered));
    const [receipt, setReceipt] = useState<Ticket | null>(null);
    const [error, setError] = useState("");

    const ticketTotal = ticket.serverTotal ?? ticket.items.reduce(
        (sum, item) => sum + item.subtotal,
        0
    );
    // #91 charges ONLY the outstanding balance when an already-paid customer
    // returns. Never display the historical total as the next amount to collect.
    const total = ticket.balanceDue ?? Math.max(0, ticketTotal - (ticket.amountPaid ?? 0));
    const isReceivable = ticket.serviceStatus === "completed" && ticket.deferredAt != null;
    const [currentBusinessDate] = useState(() => businessDateJst(Date.now()));
    const serviceBusinessDate = ticket.serviceBusinessDate ?? businessDateJst(ticket.created_at * 1000);
    const previousNight = isPreviousServiceDate(serviceBusinessDate, currentBusinessDate);
    const requiresDate = previousNight && (!isReceivable || canConfirmCollectionDate);
    const [collectionDate, setCollectionDate] = useState(recovered?.collection?.collection_business_date ?? "");
    const [collectionReason, setCollectionReason] = useState(recovered?.collection?.collection_date_reason ?? "");
    const dateConfirmed = !requiresDate || (canConfirmCollectionDate && validCollectionConfirmation(
        collectionDate, collectionReason, serviceBusinessDate, currentBusinessDate,
    ));
    const [amount, setAmount] = useState(String(recovered?.amount ?? total));
    const idempotencyKey = useRef(recovered?.key ?? crypto.randomUUID());
    const numericAmount = Number(amount);

    useEffect(() => {
        registerCloseGuard(() => {
            if (pending.current) return false;
            if (resolved.current || !paymentAttemptRecovery.get(ticket.id)) return true;
            return window.confirm(locale === "ja"
                ? "結果は未確認です。閉じて伝票を確認しますか？このタブで再度開くと同じ記録を再確認できます。再読み込みやログアウトの前に支払い履歴を確認してください。"
                : "Payment is unconfirmed. Close and check the ticket? Reopening in this tab keeps the same collection for retry. Check payment history before reloading or signing out.");
        });
        return () => registerCloseGuard(null);
    }, [registerCloseGuard, locale, ticket.id]);

    const handleConfirm = async () => {
        if (pending.current || resolved.current) return;
        if (!attempted && (!dateConfirmed || !Number.isSafeInteger(numericAmount) || numericAmount < 1 || numericAmount > total)) return;
        const attempt = paymentAttemptRecovery.remember(ticket.id, {
            key: idempotencyKey.current, method: paymentType, amount: numericAmount,
            collection: requiresDate ? {
                collection_business_date: collectionDate,
                collection_date_reason: collectionReason.trim(),
            } : undefined,
        });
        if (!attempt) {
            setError(locale === "ja" ? "未確認の支払いが多すぎます。新しい支払いの前に管理者と支払い履歴を確認してください。" : "Too many unconfirmed payments. Review payment history with a manager before recording another payment.");
            return;
        }
        pending.current = true;
        setAttempted(true);
        setSaving(true);
        setError("");
        try {
            const confirmed = await onConfirm(attempt.method, attempt.amount, attempt.key, attempt.collection);
            // Logout/account change clears the recovery store. An old response must
            // neither clear a newer attempt nor update a replacement dialog.
            if (!paymentAttemptRecovery.isCurrent(ticket.id, attempt)) return;
            if (confirmed && confirmed.id === ticket.id) {
                paymentAttemptRecovery.complete(ticket.id, attempt);
                resolved.current = true;
                if (mounted.current) { setReceipt(confirmed); setStep("success"); }
            } else {
                paymentAttemptRecovery.markUncertain(attempt);
                if (mounted.current) setError(locale === "ja"
                ? "お支払いの結果は未確認です。同じ記録を再確認するか、閉じて伝票の支払い履歴を確認してください。"
                : "Payment is unconfirmed. Retry the same collection, or close and check the ticket’s payment history.");
            }
        } catch (error) {
            if (!paymentAttemptRecovery.isCurrent(ticket.id, attempt)) return;
            // Only a first, explicit validation rejection proves no write happened.
            // A later error must never erase an earlier ambiguous collection.
            if (error instanceof ApiError && (error.status === 400 || error.status === 422) && !paymentAttemptRecovery.wasUncertain(attempt)) {
                paymentAttemptRecovery.complete(ticket.id, attempt);
                idempotencyKey.current = crypto.randomUUID();
                if (mounted.current) {
                    setAttempted(false);
                    setError(locale === "ja" ? "支払いは記録されませんでした。閉じて最新の残高を確認し、金額を修正してください。" : "Payment was not recorded. Close and check the latest balance, then correct the amount.");
                }
                return;
            }
            paymentAttemptRecovery.markUncertain(attempt);
            if (mounted.current) setError(locale === "ja"
                ? "お支払いの結果は未確認です。同じ記録を再確認するか、閉じて伝票の支払い履歴を確認してください。"
                : "Payment is unconfirmed. Retry the same collection, or close and check the ticket’s payment history.");
        } finally {
            pending.current = false;
            if (mounted.current) setSaving(false);
        }
    };

    if (step === "success") {
        return (
            <SuccessContainer>
                <Check>٩( ᐛ )و <br/><br/></Check>

                <h3>{locale === "ja" ? "入金を記録しました" : "Payment recorded"}</h3>
                <p>{locale === "ja" ? "記録した入金額" : "Recorded amount"}</p>

                <SuccessTotal>
                    ¥{numericAmount.toLocaleString()}
                </SuccessTotal>

                <p>{t(paymentType)}</p>
                <p role="status">{receipt && verifiedRemainingBalance(receipt) !== null
                    ? (locale === "ja" ? `未払い残高: ¥${verifiedRemainingBalance(receipt)!.toLocaleString()}` : `Remaining balance: ¥${verifiedRemainingBalance(receipt)!.toLocaleString()}`)
                    : (locale === "ja" ? "残高は未確認です。伝票の支払い履歴を確認してください。" : "Balance unavailable. Check the ticket’s payment history.")}</p>
                {receipt && verifiedRemainingBalance(receipt) === 0 && <p>{locale === "ja" ? "全額お支払い済み" : "Fully settled"}</p>}
            </SuccessContainer>
        );
    }

    return (
        <Container>
            <TotalContainer>
                {(ticket.amountPaid ?? 0) > 0 && <small>
                    {locale === "ja" ? "お支払い済み" : "Previously paid"}: ¥{(ticket.amountPaid ?? 0).toLocaleString()}
                </small>}
                <Amount>
                    ¥{total.toLocaleString()}
                </Amount>
                {isReceivable ? <label style={{ display: "grid", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
                    <span>{locale === "ja" ? "今回受け取る金額" : "Amount collected now"}</span>
                    <input type="number" min={1} max={total} step={1} inputMode="numeric"
                        value={amount} onChange={event => setAmount(event.target.value)} disabled={saving || attempted} />
                    <small>{locale === "ja" ? "残高までの一部支払いを記録できます。" : "Record a partial payment up to the remaining balance."}</small>
                </label> : <small>{t("receivePayment")}</small>}
            </TotalContainer>

            {requiresDate ? <fieldset disabled={saving || attempted} style={{ display: "grid", gap: "var(--space-1)" }}>
                <legend>{locale === "ja" ? "過去の営業日の支払いを確認" : "Confirm previous-night collection"}</legend>
                <p>{locale === "ja" ? `サービス営業日: ${serviceBusinessDate}。実際にお金を受け取った営業日を選んでください（日本時間の正午で切替）。記録日時は変更されません。` : `Service night: ${serviceBusinessDate}. Choose the business date when money was actually received (noon JST cutoff). The recording timestamp stays unchanged.`}</p>
                {canConfirmCollectionDate ? <>
                    <label>{locale === "ja" ? "実際の回収営業日" : "Actual collection business date"}
                        <input type="date" value={collectionDate} min={serviceBusinessDate} max={currentBusinessDate}
                            onChange={event => setCollectionDate(event.target.value)} required />
                    </label>
                    <label>{locale === "ja" ? "確認理由" : "Confirmation reason"}
                        <textarea value={collectionReason} maxLength={255} required
                            onChange={event => setCollectionReason(event.target.value)} />
                    </label>
                    <small>{locale === "ja" ? "未回収の場合は支払いを記録せず、未払い残高として繰り越してください。" : "If money has not been received, do not record payment. Carry the unpaid balance forward instead."}</small>
                </> : <p role="alert">{locale === "ja" ? "管理者が回収営業日を確認する必要があります。未払いの場合は残高を繰り越してください。" : "A manager must confirm the collection date. If still unpaid, carry the balance forward instead."}</p>}
            </fieldset> : null}
            <Methods role="group" aria-label={t("receivePayment")}>
                {paymentMethods.map((method, index) => (
                    <MethodButton
                        key={method.type}
                        type="button"
                        ref={node => { methodButtons.current[index] = node; }}
                        aria-pressed={paymentType === method.type}
                        $active={paymentType === method.type}
                        disabled={saving || attempted}
                        onKeyDown={event => handleMethodArrow(event, index)}
                        onClick={() => setPaymentType(method.type)}
                    >
                        <Icon 
                            size="var(--font-size-h3)"
                            name={method.icon} />
                        <span>{t(method.label)}</span>
                    </MethodButton>
                ))}
            </Methods>

            {error ? <p role="alert">{error}</p> : null}
            <Footer>
                <button
                    className="hollow"
                    onClick={closeModal}
                    disabled={saving}
                >
                    {attempted ? (locale === "ja" ? "閉じて伝票を確認" : "Close and check ticket") : t("cancel")}
                </button>

                <button disabled={saving || (!attempted && (!dateConfirmed || !Number.isSafeInteger(numericAmount) || numericAmount < 1 || numericAmount > total))} onClick={() => void handleConfirm()}>
                    {saving ? (locale === "ja" ? "処理中…" : "Processing…") : attempted
                        ? (locale === "ja" ? "同じ記録を安全に再確認" : "Safely retry same collection") : t("confirmPayment")}
                </button>
            </Footer>
        </Container>
    );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2);
  width: 100%;
  box-sizing: border-box;
  flex: 1;
  min-width: 0;

  @media (min-width: 768px) {
    padding: var(--space-3);
    min-width: 420px;
    max-width: 560px;
  }
`;

const TotalContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
`

const Methods = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-1);
    min-width: 0;

    button {
        padding: var(--space-1);
        min-height: 80px;
        min-width: 0;
    }
`

const Footer = styled.footer`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);

    button {
        width: 100%;
        white-space: normal;
    }

    @media (min-width: 768px) {
        gap: var(--space-2);
    }
`

const MethodButton = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: var(--space-1);

  background: ${({ $active }) =>
        $active ? "var(--neutral-400)" : "var(--neutral-800)"};

  border: 1px solid
    ${({ $active }) =>
        $active ? "var(--royal-200)" : "var(--neutral-700)"};

  color: white;

  span {
    font-size: var(--font-size-small);
    text-align: center;
    white-space: normal;
  }

  transition: background 150ms ease, border-color 150ms ease;

  @media (hover: hover) {
    &:hover {
      transform: translateY(-4px);
    }
  }

  &:active {
    transform: translateY(0);
  }
`;

const Amount = styled.data`
    font-size: var(--font-size-h2);
    font-weight: bold;

    @media (min-width: 768px) {
        font-size: var(--font-size-h1);
    }
`

const SuccessContainer = styled.div`
    background: var(--success-400);
    color: var(--neutral-950);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    flex: 1;
    width: 100%;
    box-sizing: border-box;
    min-width: 0;
    padding: var(--space-2);
    gap: var(--space-1);

    h3 {
        font-size: var(--font-size-h4);
    }

    @media (min-width: 768px) {
        min-width: 420px;
        padding: var(--space-3);
    }
`

const Check = styled.h1`

`

const SuccessTotal = styled.data`
    font-size: var(--font-size-h2);
`

