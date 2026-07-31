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

    onUpdatePrice: (
        ticketId: number,
        itemId: number,
        price: number
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
    inStock?: boolean;

    category: string;
    subcategory?: string;

    name: string;
    description?: string;
    notes?: string;

    prices: Prices;

    cocktailIngredient?: boolean;

    tags?: string[];
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
    onUpdatePrice,
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
    const [editingPriceItemId, setEditingPriceItemId] = useState<number | null>(null);
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

            <Header>
                <ControlPanel>

                    <BackButton onClick={onClose}>
                        <Icon name="ArrowLeft" />
                        <BackButtonText>Back</BackButtonText>
                    </BackButton>

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
                        <TicketHeader>
                            <TicketNumber>
                                Ticket #{ticket?.id}
                            </TicketNumber>
                            <CustomerName
                                onClick={() => {
                                    setEditingName(true);
                                }}
                            >
                                {ticket?.name || "Walk-in"}
                                <Icon name="PencilSimple" size={18} />
                            </CustomerName>
                            <TicketCreationTime>
                                Created at{" "}
                                {createdAt?.toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                })}
                            </TicketCreationTime>
                        </TicketHeader>
                    )}

                    <SelectorButtons>
                        <LeftButton
                            // className="small hollow secondary"
                            onClick={onPrevious}
                            disabled={!hasPrevious}
                        >
                            <Icon name="CaretLeft" />
                            <PrevButtonText>Prev</PrevButtonText>
                        </LeftButton>

                        <RightButton
                            // className="small hollow secondary"
                            onClick={onNext}
                            disabled={!hasNext}
                        >
                            <NextButtonText>Next</NextButtonText>
                            <Icon name="CaretRight" />
                        </RightButton>
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
                        <AddItemText>Add Item</AddItemText>
                    </AddItemButton>
                </ItemsHeader>

                <ItemList>
                    {ticket?.items.map((item) => (
                        <TicketDetailItem
                            key={item.id}
                            id={item.id}
                            name={item.name}
                            unitPrice={item.unit_price}
                            quantity={item.quantity}

                            isEditingPrice={
                                editingPriceItemId === item.id
                            }

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
                                setEditingPriceItemId(item.id);
                            }}

                            onSavePrice={(price) => {
                                onUpdatePrice(
                                    ticket.id,
                                    item.id,
                                    price
                                );

                                setEditingPriceItemId(null);
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

const TicketDetailsContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: visible;

    @media (min-width: 768px) {
        height: calc(100vh - var(--space-4) - var(--space-3));
    }
`;

const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--neutral-800);
`;

const TicketNumber = styled.label`
    @media (min-width: 900px) {
        justify-self: start;
    }
`;

const NameInput = styled.input`
  width: 100%;
  text-align: center;
`;

const Items = styled.section`
  flex: 1;

  display: flex;
  flex-direction: column;

  overflow-y: auto;
  overflow-x: visible;
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
    overflow-x: visible;
    overflow-y: auto;
    /* Target the specific class or element */

  scrollbar-width: none;

  -ms-overflow-style: none;

&::-webkit-scrollbar {
    display: none;
  }

`;

const Footer = styled.footer`
    display: flex;
    flex-direction: column;

    gap: var(--space-1);
    padding-top: var(--space-1);
  
  border-top: 1px solid var(--neutral-800);
  
  @media (min-width: 768px) {
    padding-top: var(--space-3);
    gap: var(--space-3);
  }

  @media (min-height: 400px) {
    gap: var(--space-2);
    padding-top: var(--space-2);
  }
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

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-0);
  min-width: unset;
  width: fit-content;
  border-radius: var(--space-1);
  background: var(--neutral-900);
  border: 1px solid var(--neutral-500);
  flex-shrink: 1;

  @media (min-width: 768px) {
    display: none;
  }
`;

const BackButtonText = styled.span`
    display: none;

    @media (min-width: 576px) {
        display: flex;
    }
`

const ControlPanel = styled.div`
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    align-items: center;
    
    @media (min-width: 786px) {
        display: flex;
        justify-content: center;
        align-items: center;
    }
`

const SelectorButtons = styled.div`
    display: flex;
    gap: 0;
    justify-self: flex-end;

    @media (min-width: 768px) {
        display: none;
    }
`
const LeftButton = styled.button`
    border-radius: var(--space-1) 0 0 var(--space-1);
    padding: var(--space-0);
    border: 1px solid var(--neutral-500);
    background: var(--neutral-900);

    @media (min-width: 576px) {
        padding-right: var(--space-1);
    }
`

const RightButton = styled.button`
    border-radius: 0 var(--space-1) var(--space-1) 0;
    padding: var(--space-0);
    border: 1px solid var(--neutral-500);
    border-left: none;
    background: var(--neutral-900);
    
    @media (min-width: 576px) {
        padding-left: var(--space-1);
    }
`

const PrevButtonText = styled.span`
    display: none;

    @media (min-width: 576px) {
        display: flex;
    }
`

const NextButtonText = styled.span`
    display: none;

    @media (min-width: 576px) {
        display: flex;
    }
`

const TicketCreationTime = styled.small`
    color: var(--neutral-500);

    @media (min-width: 996px) {
        justify-self: flex-end;
    }
`

const ItemsHeader = styled.div`
    display: grid;
    grid-template-columns: repeat(4,1fr);
    align-items: center;
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--neutral-700);
    
    @media (min-width: 768px) {        
        padding-inline: var(--space-1);
        gap: var(--space-2);
    }
`;

const AddItemButton = styled.button`
    width: auto;
    justify-self: end;
    background: var(--primary-500);
`

const AddItemText = styled.span`
    display: none;

    @media (min-width: 576px) {
        display: block;
    }
`

const TicketHeader = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;

    @media (min-width: 900px) {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        width: 100%;
    }
`
