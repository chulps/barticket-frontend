// PaidTicketSummary.tsx
import styled from "styled-components";

import Icon from "./Icon"
import type { Ticket } from "../types/Ticket";

type Props = {
    ticket: Ticket;
};

const paymentLabels = {
    cash: "Cash",
    card: "Card",
    other: "Other",
};

export default function PaidTicketSummary({ ticket }: Props) {
    const total = ticket.items.reduce(
        (sum, item) => sum + item.subtotal,
        0
    );

    return (
        <Dialog>
            <Row>
                <label>status</label>
                <TicketStatusPoint>
                    <Icon
                        name="CheckCircle"
                        size={24}
                        weight="fill"
                        color="var(--success-300"
                    />
                    <span>Paid</span>
                </TicketStatusPoint>
            </Row>

            <Row>
                <label>Payment</label>
                <TicketStatusPoint>
                    <Icon
                        name="Money"
                        size={24}
                        weight="fill"
                        color="var(--success-300"
                    />
                    {ticket.payment
                        ? paymentLabels[ticket.payment.type]
                        : "-"}
                </TicketStatusPoint>
            </Row>
            <Row>
                <label>Items</label>
                <TicketStatusPoint>
                    <Icon
                        name="Hash"
                        size={24}
                        weight="fill"
                        color="var(--success-300"
                    />{ticket.items.length}</TicketStatusPoint>
            </Row>
            <Row>
                <label>Paid</label>
                <TicketStatusPoint>

                    <Icon
                        name="Calendar"
                        size={24}
                        weight="fill"
                        color="var(--success-300"
                    />
                    {ticket.payment
                        ? new Date(ticket.payment.paid_at * 1000).toLocaleString()
                        : "-"}
                </TicketStatusPoint>
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

const TicketStatusPoint = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-0);
`;

const Row = styled.div`

  &:not(:last-child) {
    margin-bottom: var(--space-2);
  }

  label { 
    color: var(--success-700);
  }

  @media (min-width: 768px) {
    flex-direction: column;

     &:not(:last-child) {
    margin-bottom: 0;
  }
  }
`;

const Total = styled.data`
    font-size: varr(--font-size-h1);
`