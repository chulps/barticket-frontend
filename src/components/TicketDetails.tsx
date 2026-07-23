import styled from "styled-components";
import TicketDetailItem from "../components/TicketDetailItem";
import { useState } from "react";
import Icon from "../components/Icon"

type Ticket = {
    id: number;
    name: string;
    items: {
        type: "cover" | "menu";
        menu_item_id?: number;
        price_key?: string;
        name: string;
        unit_price: number;
        quantity: number;
        subtotal: number;
    }[];
};

type TicketDetailsProps = {
    ticket: Ticket | null;

    onUpdateQuantity: (
        ticketId: number,
        itemName: string,
        change: number
    ) => void;

    onUpdateName: (
        ticketId: number,
        name: string
    ) => void;

    onClose: () => void;
    onPrevious: () => void;
    onNext: () => void;

    hasPrevious: boolean;
    hasNext: boolean;
};
export default function TicketDetails({
    ticket,
    onUpdateQuantity,
    onUpdateName,
    onClose,
    onPrevious,
    onNext,
    hasPrevious,
    hasNext,
}: TicketDetailsProps) {

    const [editingName, setEditingName] = useState(false);
    const total =
        ticket?.items.reduce(
            (sum, item) => sum + item.subtotal,
            0
        ) ?? 0;

    return (
        <Container>

            <MobileToolbar>
                <BackButton className="hollow secondary small" onClick={onClose}>
                    <Icon name="ArrowLeft" />
                    Back
                </BackButton>
            </MobileToolbar>

            <Header>
                <ControlPanel>
                    <TicketNumber>
                        Ticket #{ticket?.id}
                    </TicketNumber>
                    <TicketCreationTime>
                        Created at date/time
                    </TicketCreationTime>
                </ControlPanel>
                <ControlPanel>
                    {editingName ? (
                        <NameInput
                            autoFocus
                            type="text"
                            value={ticket?.name ?? ""}
                            onChange={(e) =>
                                ticket &&
                                onUpdateName(ticket.id, e.target.value)
                            }
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    setEditingName(false);
                                }
                            }}
                            onBlur={() => setEditingName(false)}
                        />
                    ) : (
                        <CustomerName onClick={() => setEditingName(true)}>
                            {ticket?.name || "Walk-in"}
                            <Icon name="PencilSimple" size={18} />
                        </CustomerName>
                    )}
                    <SelectorButtons>
                        <button
                            className="small hollow secondary"
                            onClick={onPrevious}
                            disabled={!hasPrevious}
                        >
                            <Icon name="CaretLeft" />
                        </button>

                        <button
                            className="small hollow secondary"
                            onClick={onNext}
                            disabled={!hasNext}
                        >
                            <Icon name="CaretRight" />
                        </button>
                    </SelectorButtons>
                </ControlPanel>
            </Header>

            <Items>
                <ItemsHeader>
                    <SectionTitle>Items</SectionTitle>

                    <button className="small hollow">
                        <Icon name="Plus" />
                        Add Item
                    </button>
                </ItemsHeader>

                <ItemList>
                    {ticket?.items.map((item) => (
                        <TicketDetailItem
                            key={`${item.name}-${item.price_key ?? "cover"}`}
                            name={item.name}
                            unitPrice={item.unit_price}
                            quantity={item.quantity}
                            onIncrease={() =>
                                onUpdateQuantity(ticket.id, item.name, 1)
                            }
                            onDecrease={() =>
                                onUpdateQuantity(ticket.id, item.name, -1)
                            }
                        />
                    ))}
                </ItemList>
            </Items>

            <Footer>
                <Totals>
                    <Row>
                        <label>Total</label>
                        <data>¥{total.toLocaleString()}</data>
                    </Row>
                </Totals>

                <Actions>
                    <button className="secondary">
                        Cancel Ticket
                    </button>

                    <button>
                        Take Payment
                    </button>
                </Actions>
            </Footer>
        </Container>
    );
}

const Container = styled.section`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: visible;
`;

const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--neutral-800);
`;

const TicketNumber = styled.label``;

const NameInput = styled.input`
  width: 100%;
`;

const Items = styled.section`
  flex: 1;

  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  padding: var(--space-2) 0;

  overflow-y: auto;
`;

const SectionTitle = styled.label``;

const ItemList = styled.div`
    color: white;
    height: 100%;
    overflow: visible auto;
`;

const Footer = styled.footer`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  padding-top: var(--space-3);
  border-top: 1px solid var(--neutral-800);
`;

const Totals = styled.div`
  display: flex;
  flex-direction: column;
  font-size: var(--font-size-h4);
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
`;

const Actions = styled.div`
  display: flex;
  gap: var(--space-2);

  > * {
    flex: 1;
  }
`;

const CustomerName = styled.h3`
  display: flex;
  align-items: center;
  gap: var(--space-1);

  padding: 0;
  border: none;
  background: none;

  color: inherit;
  cursor: pointer;

  &:hover {
    color: white;
  }
`;

const MobileToolbar = styled.div`
  display: none;

  @media (max-width: 768px) {
    display: flex;
    margin-bottom: var(--space-2);
  }
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: var(--space-1);
`;

const ControlPanel = styled.div`
    display: flex;
    justify-content: space-between;
`

const SelectorButtons = styled.div`
    display: flex;
    gap: var(--space-1);
`

const TicketCreationTime = styled.small`
    color: var(--neutral-500);
`

const ItemsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-inline: var(--space-1);
`;