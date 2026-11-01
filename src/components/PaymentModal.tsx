// src/components/PaymentModal.tsx

import { useRef, useState, type KeyboardEvent } from "react";
import { businessDateJst } from "../pages/shiftControlPolicy";
import { isPreviousServiceDate, validCollectionConfirmation } from "./paymentCollectionPolicy";
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
    onConfirm: (paymentType: PaymentType, amount: number, idempotencyKey?: string, collection?: CollectionDateConfirmation) => Promise<boolean>;
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
    const { closeModal } = useModal();
    const { t, locale } = useI18n();

    const [paymentType, setPaymentType] =
        useState<PaymentType>("cash");

    const [step, setStep] =
        useState<"select" | "success">("select");
    const pending = useRef(false);
    const methodButtons = useRef<(HTMLButtonElement | null)[]>([]);
    function handleMethodArrow(event: KeyboardEvent<HTMLButtonElement>, index: number) {
        if (saving) return;
        const next = nextSelectorIndex(index, paymentMethods.length, event.key);
        if (next === null) return;
        event.preventDefault();
        setPaymentType(paymentMethods[next].type);
        methodButtons.current[next]?.focus();
    }
    const [saving, setSaving] = useState(false);
    const [attempted, setAttempted] = useState(false);
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
    const [collectionDate, setCollectionDate] = useState("");
    const [collectionReason, setCollectionReason] = useState("");
    const dateConfirmed = !requiresDate || (canConfirmCollectionDate && validCollectionConfirmation(
        collectionDate, collectionReason, serviceBusinessDate, currentBusinessDate,
    ));
    const [amount, setAmount] = useState(String(total));
    const idempotencyKey = useRef(crypto.randomUUID());
    const numericAmount = Number(amount);

    const handleConfirm = async () => {
        if (pending.current) return;
        if (!dateConfirmed) return;
        pending.current = true;
        setAttempted(true);
        setSaving(true);
        setError("");
        try {
            const confirmed = await onConfirm(paymentType, numericAmount, idempotencyKey.current, requiresDate ? {
                collection_business_date: collectionDate,
                collection_date_reason: collectionReason.trim(),
            } : undefined);
            if (confirmed) setStep("success");
            else setError(locale === "ja" ? "お支払いを確認できませんでした。再試行前にチケットの状態を確認してください。" : "Payment not confirmed. Check the ticket before retrying.");
        } catch {
            setError(locale === "ja"
                ? "お支払いを確認できませんでした。伝票の状態を確認してください。"
                : "Payment could not be confirmed. Check ticket status before retrying.");
        } finally {
            pending.current = false;
            setSaving(false);
        }
    };

    if (step === "success") {
        return (
            <SuccessContainer>
                <Check>٩( ᐛ )و <br/><br/></Check>

                <h3>{t("paymentComplete")}</h3>

                <SuccessTotal>
                    ¥{(isReceivable ? numericAmount : total).toLocaleString()}
                </SuccessTotal>

                <p>{t(paymentType)}</p>
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
                    {t("cancel")}
                </button>

                <button disabled={saving || !dateConfirmed || !Number.isSafeInteger(numericAmount) || numericAmount < 1 || numericAmount > total} onClick={() => void handleConfirm()}>
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

