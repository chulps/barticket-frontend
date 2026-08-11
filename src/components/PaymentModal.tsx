// src/components/PaymentModal.tsx

import { useState } from "react";
import styled from "styled-components";

import { useModal } from "../hooks/useModal";
import type { Ticket } from "../types/Ticket";

import Icon from "../components/Icon"

type IconName = React.ComponentProps<typeof Icon>["name"];type PaymentType = "cash" | "card" | "other";

type PaymentModalProps = {
    ticket: Ticket;
    onConfirm: (paymentType: PaymentType) => void;
};


const paymentMethods = [
  {
    type: "cash",
    label: "Cash",
    icon: "Money",
  },
  {
    type: "card",
    label: "Card",
    icon: "CreditCard",
  },
  {
    type: "other",
    label: "Other",
    icon: "Wallet",
  },
] as const satisfies {
  type: PaymentType;
  label: string;
  icon: IconName;
}[];

export default function PaymentModal({
    ticket,
    onConfirm,
}: PaymentModalProps) {
    const { closeModal } = useModal();

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
                <Check>✓</Check>

                <h3>Payment Complete</h3>

                <SuccessTotal>
                    ¥{total.toLocaleString()}
                </SuccessTotal>

                <small>{paymentType.toUpperCase()}</small>
            </SuccessContainer>
        );
    }

    return (
        <Container>
            <TotalContainer>
                <Amount>
                    ¥{total.toLocaleString()}
                </Amount>
                <small>Receive Payment</small>
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
                        <span>{method.label}</span>
                    </MethodButton>
                ))}
            </Methods>

            <Footer>
                <button
                    className="hollow"
                    onClick={closeModal}
                >
                    Cancel
                </button>

                <button onClick={handleConfirm}>
                    Confirm Payment
                </button>
            </Footer>
        </Container>
    );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--space-3);
  width: 100%;
  height: fill-available;
  flex-grow: 1;
  
  @media (min-width: 768px) {
    max-width: var(--space-7);
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

    button {
        padding: unset;
        aspect-ratio: 1/1;
        flex: 1;
    }
`

const Footer = styled.footer`
    display: flex;
    flex-direction: column;
    gap: var(--space-2);

    @media (min-width: 768px) {
        min-width: var(--space-6);
        button {
            flex: 1;
        }
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
  }

  transition: all 150ms ease;

  &:hover {
    transform: translateY(-8px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const Amount = styled.data`
    font-size: var(--font-size-h1);
    font-weight: bold;
`

const SuccessContainer = styled.div`
    background: var(--success-400);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    flex: 1;
    min-width: var(--space-6);
`

const Check = styled.h1`

`

const SuccessTotal = styled.data`
    font-size: var(--font-size-h2);
`