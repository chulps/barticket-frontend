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
                <ValueLabel>
                    <Icon
                        name="CheckCircle"
                        size={"var(--font-size-h5"}
                        weight="fill"
                        color="var(--success-700)"
                    />
                    Status:
                </ValueLabel>
                <Value>
                    <span>Paid</span>
                </Value>
            </Row>

            <Row>
                <ValueLabel>
                    <Icon
                        name="Money"
                        size={"var(--font-size-h5"}
                        weight="fill"
                        color="var(--success-700)"
                    />
                    Payment Type:
                </ValueLabel>
                <Value>
                    {ticket.payment
                        ? paymentLabels[ticket.payment.type]
                        : "-"}
                </Value>
            </Row>
            <Row>
                <ValueLabel>
                    <Icon
                        name="Hash"
                        size={"var(--font-size-h5"}
                        weight="fill"
                        color="var(--success-700)"
                    />
                    Number of Items:
                </ValueLabel>
                <Value>{ticket.items.length}</Value>
            </Row>
            <Row>
                <ValueLabel>
                    <Icon
                        name="Calendar"
                        size={"var(--font-size-h5"}
                        weight="fill"
                        color="var(--success-700)"
                    />
                    Date/time Paid:
                </ValueLabel>
                <Value>
                    {ticket.payment
                        ? new Date(ticket.payment.paid_at * 1000).toLocaleString(undefined, {
                            year: "numeric",
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                        })
                        : "-"}
                </Value>
            </Row>

        </Dialog>
    );
}

const Dialog = styled.section`
  margin: var(--space-2) 0;
  border-radius: var(--space-2);
  padding: var(--space-3);
  background: var(--success-900);
  border: 1px solid var(--success-800);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-2);

    @media screen and (min-width: 992px) {
        flex-direction: row;
        justify-content: space-between;
    }


`;

const Value = styled.data`
  display: flex;
  align-items: center;
  gap: var(--space-0);
  text-align: right;
  font-weight: bold;
  color: var(--success-300);
  @media (min-width: 992px) {
    text-align: left;
  }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  align-items: center;

  label {
    color: var(--success-700);
  }

  @media (min-width: 992px) {
    flex-direction: column;
  }
`;

const ValueLabel = styled.label`
    display: flex;
    gap: var(--space-0);
    align-items: center;
`