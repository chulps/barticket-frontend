// src/components/PaymentModal.tsx

import { useState } from "react";
import styled from "styled-components";

import { useModal } from "../hooks/useModal";
import type { Ticket } from "../types/Ticket";

import Icon from "../components/Icon"
import { useI18n, type MessageKey } from "../i18n";

type IconName = React.ComponentProps<typeof Icon>["name"];type PaymentType = "cash" | "card" | "other";

type PaymentModalProps = {
    ticket: Ticket;
    onConfirm: (paymentType: PaymentType) => void;
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
}: PaymentModalProps) {
    const { closeModal } = useModal();
    const { t } = useI18n();

    const [paymentType, setPaymentType] =
        useState<PaymentType>("cash");

    const [step, setStep] =
        useState<"select" | "success">("select");

    const total = ticket.items.reduce(
        (sum, item) => sum + item.subtotal,
        0
    );

    const handleConfirm = () => {
        onConfirm(paymentType);
        setStep("success");
    };

    if (step === "success") {
        return (
            <SuccessContainer>
                <Check>٩( ᐛ )و <br/><br/></Check>

                <h3>{t("paymentComplete")}</h3>

                <SuccessTotal>
                    ¥{total.toLocaleString()}
                </SuccessTotal>

                <p>{t(paymentType)}</p>
            </SuccessContainer>
        );
    }

    return (
        <Container>
            <TotalContainer>
                <Amount>
                    ¥{total.toLocaleString()}
                </Amount>
                <small>{t("receivePayment")}</small>
            </TotalContainer>

            <Methods>
                {paymentMethods.map(method => (
                    <MethodButton
                        key={method.type}
                        $active={paymentType === method.type}
                        onClick={() => setPaymentType(method.type)}
                    >
                        <Icon 
                            size="var(--font-size-h3)"
                            name={method.icon} />
                        <span>{t(method.label)}</span>
                    </MethodButton>
                ))}
            </Methods>

            <Footer>
                <button
                    className="hollow"
                    onClick={closeModal}
                >
                    {t("cancel")}
                </button>

                <button onClick={handleConfirm}>
                    {t("confirmPayment")}
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
    display: flex;
    gap: var(--space-1);
    min-width: 0;

    button {
        padding: var(--space-1);
        aspect-ratio: 1/1;
        flex: 1;
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