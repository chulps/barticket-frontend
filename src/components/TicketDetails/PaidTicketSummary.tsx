// PaidTicketSummary.tsx
import styled from "styled-components";

import Icon from "../Icon"
import type { Ticket } from "../../types/Ticket";

type Props = {
    ticket: Ticket;
};

const paymentLabels = {
    cash: "Cash",
    card: "Card",
    other: "Other",
};

export default function PaidTicketSummary({ ticket }: Props) {

    return (
        <Dialog>
            <Row>
                <label>status</label>
                <Value>
                    <Icon
                        name="CheckCircle"
                        size={24}
                        weight="fill"
                        color="var(--success-300)"
                    />
                    <span>Paid</span>
                </Value>
            </Row>

            <Row>
                <label>Payment</label>
                <Value>
                    <Icon
                        name="Money"
                        size={24}
                        weight="fill"
                        color="var(--success-300)"
                    />
                    {ticket.payment
                        ? paymentLabels[ticket.payment.type]
                        : "-"}
                </Value>
            </Row>
            <Row>
                <label>Items</label>
                <Value>
                    <Icon
                        name="Hash"
                        size={24}
                        weight="fill"
                        color="var(--success-300)"
                    />{ticket.items.length}</Value>
            </Row>
            <Row>
                <label>Paid</label>
                <Value>

                    <Icon
                        name="Calendar"
                        size={24}
                        weight="fill"
                        color="var(--success-300)"
                    />
                    {ticket.payment
                        ? new Date(ticket.payment.paid_at * 1000).toLocaleString()
                        : "-"}
                </Value>
            </Row>

        </Dialog>
    );
}

const Dialog = styled.section`
  margin: var(--space-2) 0;
  padding: var(--space-3);

  background: var(--success-900);
  border: 1px solid var(--success-800);
  border-radius: var(--space-2);

  @media (min-width: 768px) {
    display: flex;
    justify-content: space-between;
  }

`;

const Value = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-0);
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);

  &:not(:last-child) {
    margin-bottom: var(--space-2);
  }

  label {
    color: var(--success-700);
    text-transform: uppercase;
    font-size: var(--font-size-small);
  }

  @media (min-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);

    &:not(:last-child) {
      margin-bottom: 0;
    }
  }
`;