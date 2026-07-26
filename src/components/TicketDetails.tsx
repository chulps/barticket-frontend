import styled from "styled-components";
import TicketDetailItem from "../components/TicketDetailItem";
import { useRef, useState } from "react";
import Icon from "../components/Icon"
import AddItemModal from "../components/AddItemModal";

// types
type Ticket = {
    id: number;
    name: string;
    created_at: number;
    items: {
        id: number;

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
    menu: MenuData | null;

    onUpdateQuantity: (
        ticketId: number,
        itemId: number,
        change: number
    ) => void;

    onRemoveItem: (
        ticketId: number,
        itemId: number
    ) => void;

    onUpdateName: (
        ticketId: number,
        name: string
    ) => void;

    onAddItem: (
        ticketId: number,
        menuItem: MenuItem,
        priceKey: keyof Prices,
        unitPrice: number
    ) => void;

    onClose: () => void;
    onPrevious: () => void;
    onNext: () => void;

    hasPrevious: boolean;
    hasNext: boolean;
};

type Prices = {
    standard?: number;
    "15ml"?: number;
    "30ml"?: number;
};

type MenuItem = {
    id: number;
    inStock: boolean;

    category: string;
    subcategory?: string;

    name: string;
    description?: string;
    notes?: string;

    prices: Prices;

    cocktail?: boolean;
};

type MenuData = {
    coverCharge: number;
    items: MenuItem[];
};

// component
export default function TicketDetails({
    ticket,
    menu,
    onUpdateQuantity,
    onUpdateName,
    onAddItem,
    onRemoveItem,
    onClose,
    onPrevious,
    onNext,
    hasPrevious,
    hasNext,
}: TicketDetailsProps) {

    const [editingName, setEditingName] = useState(
        () => ticket?.name === ""
    );

    const [showAddItemModal, setShowAddItemModal] = useState(false);

    const nameInputRef = useRef<HTMLInputElement>(null);

    const total =
        ticket?.items.reduce(
            (sum, item) => sum + item.subtotal,
            0
        ) ?? 0;

    const createdAt = ticket
        ? new Date(ticket.created_at * 1000)
        : null;

    return (
        <TicketDetailsContainer>

            <MobileToolbar>
                <BackButton className="hollow secondary small" onClick={onClose}>
                    <Icon name="ArrowLeft" />
                    Back
                </BackButton>
            </MobileToolbar>

            <Header>
                <ControlPanel>
                    <div>
                        <TicketNumber>
                            Ticket #{ticket?.id}
                        </TicketNumber>
                        <TicketCreationTime>
                            Created at{" "}
                            {createdAt?.toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                            })}
                        </TicketCreationTime>
                    </div>
                    {editingName ? (
                        <NameInput
                            ref={nameInputRef}
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
                        <CustomerName
                            onClick={() => {
                                setEditingName(true);
                            }}
                        >
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
                    <SectionTitle>QTY</SectionTitle>
                    <SectionTitle>Subtotal</SectionTitle>
                    <AddItemButton
                        className="small hollow"
                        onClick={() => setShowAddItemModal(true)}
                    >
                        <Icon name="Plus" />
                        Add Item
                    </AddItemButton>
                </ItemsHeader>

                <ItemList>
                    {ticket?.items.map((item) => (
                        <TicketDetailItem
                            id={item.id}
                            key={item.id}
                            name={item.name}
                            unitPrice={item.unit_price}
                            quantity={item.quantity}
                            onIncrease={() =>
                                onUpdateQuantity(ticket.id, item.id, 1)
                            }
                            onDecrease={() =>
                                onUpdateQuantity(ticket.id, item.id, -1)
                            }
                            onRemove={() =>
                                onRemoveItem(ticket.id, item.id)
                            }
                            onAdjustPrice={() => {
                                console.log("adjust price", item.id);
                            }}
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
                    <button className="hollow danger">
                        <Icon name="X" />
                        Cancel Ticket
                    </button>

                    <button className="hollow success">
                        <Icon name="Money" />
                        Take Payment
                    </button>
                </Actions>
            </Footer>

            {showAddItemModal && menu && (
                <AddItemModal
                    menu={menu}
                    onClose={() => setShowAddItemModal(false)}
                    onAddItem={(item, priceKey) => {
                        if (!ticket) return;

                        const unitPrice = item.prices[priceKey];

                        if (unitPrice === undefined) return;

                        onAddItem(ticket.id, item, priceKey, unitPrice);

                        setShowAddItemModal(false);
                    }}
                />
            )}

        </TicketDetailsContainer >
    );
}

const TicketDetailsContainer = styled.section`
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
  text-align: center;
`;

const Items = styled.section`
  flex: 1;

  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  padding: var(--space-2) 0;

  overflow-y: auto;
`;

const SectionTitle = styled.label`
    justify-self: center;
    
    &:first-of-type {
        justify-self: start;
    }

`;

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
  align-items: center;
`;

const Actions = styled.div`
  display: flex;
  gap: var(--space-2);

  > * {
    flex: 1;
  }
    flex-direction: column;

    @media screen and (min-width: 768px) {
        flex-direction: row;
    }
`;

const CustomerName = styled.h4`
display: flex;
align-items: center;  
justify-self: center;
  gap: var(--space-1);

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
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    align-items: center;
    padding: var(--space-2) 0 0 0;
`

const SelectorButtons = styled.div`
    display: flex;
    gap: var(--space-1);
    justify-self: flex-end;
    
`

const TicketCreationTime = styled.small`
    color: var(--neutral-500);
`

const ItemsHeader = styled.div`
    display: grid;
    gap: var(--space-2);
  grid-template-columns: repeat(4,1fr);
  align-items: center;
  padding-inline: var(--space-1);
`;

const AddItemButton = styled.button`
    width: auto;
    justify-self: end;
`