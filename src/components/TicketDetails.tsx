import styled from "styled-components";
import TicketDetailItem from "../components/TicketDetailItem";

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
};
export default function TicketDetails({
    ticket,
    onUpdateQuantity,
}: TicketDetailsProps) {

    const total =
        ticket?.items.reduce(
            (sum, item) => sum + item.subtotal,
            0
        ) ?? 0;

    return (
        <Container>
            <Header>
                <TicketNumber>
                    Ticket #{ticket?.id}
                </TicketNumber>

                <NameInput
                    type="text"
                    value={ticket?.name ?? ""}
                    placeholder="Enter customer name..."
                    readOnly
                />
            </Header>

            <Items>
                <SectionTitle>Items</SectionTitle>

                <Placeholder>
                    {ticket?.items.map((item) => (
                        <TicketDetailItem
                            key={`${item.name}-${item.price_key ?? "cover"}`}
                            name={item.name}
                            unitPrice={item.unit_price}
                            quantity={item.quantity}
                            onIncrease={() =>
                                onUpdateQuantity(
                                    ticket.id,
                                    item.name,
                                    1
                                )
                            }
                            onDecrease={() =>
                                onUpdateQuantity(
                                    ticket.id,
                                    item.name,
                                    -1
                                )
                            }
                        />
                    ))}
                </Placeholder>
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
`;

const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  padding-bottom: var(--space-3);
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

  padding: var(--space-3) 0;

  overflow-y: auto;
`;

const SectionTitle = styled.label``;

const Placeholder = styled.div`
  color: white;
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