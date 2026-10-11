// TicketItems.tsx

// import react stuff
import type { Dispatch, SetStateAction } from "react";

// npm packages
import styled from "styled-components";

// UI components
import TicketDetailItem from "./TicketItem";
import Icon from "../Icon";
import AddItemPicker from "../AddItemPicker";
import AddStaffDrink from "../AddStaffDrink";

// Types
import type { MenuData, MenuItem, Prices } from "../../types/Menu";
import type { Ticket } from "../../types/Ticket";

// Hooks
import { useModal } from "../../hooks/useModal";
import { menuLabel, useI18n } from "../../i18n";

type TicketItemsProps = {
    ticket: Ticket;
    menu: MenuData | null;
    activeTab: "open" | "paid" | "cancelled";

    editingPriceItemId: number | null;
    setEditingPriceItemId: Dispatch<SetStateAction<number | null>>;

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

    onAddStaffDrink: (ticketId: number, staffId: number, menuItemId: number | null, priceKey: string, quantity: number) => void;

    onAddItem: (
        ticketId: number,
        menuItem: MenuItem,
        priceKey: keyof Prices,
        unitPrice: number
    ) => void;
};

export default function TicketItems({
    ticket,
    menu,
    activeTab,
    editingPriceItemId,
    setEditingPriceItemId,
    onUpdateQuantity,
    onUpdatePrice,
    onRemoveItem,
    onAddItem,
    onAddStaffDrink,
}: TicketItemsProps) {
    const { openModal, closeModal } = useModal();
    const { t, locale } = useI18n();

    const isEditable = activeTab === "open";

    return (
        <Items>
            <ItemsHeader>
                <SectionTitle>{t("items")}</SectionTitle>
                <SectionTitle>{t("qty")}</SectionTitle>
                <SectionTitle>{t("subtotal")}</SectionTitle>

                <AddItemButton
                    disabled={!isEditable}
                    onClick={() => {
                        if (!menu) return;

                        openModal({
                            title: t("addItem"),
                            maxWidth: "var(--space-7)",
                            content: (
                                <AddItemPicker
                                    menu={menu}
                                    onAddItem={(item, priceKey) => {
                                        const unitPrice = item.prices[priceKey];

                                        if (unitPrice === undefined) return;

                                        onAddItem(
                                            ticket.id,
                                            item,
                                            priceKey,
                                            unitPrice
                                        );

                                        closeModal();
                                    }}
                                />
                            ),
                        });
                    }}
                >
                    <Icon name="Plus" />
                    <AddItemText>{t("addItem")}</AddItemText>
                </AddItemButton>
                <button className="staff-drink-action" type="button" disabled={!isEditable || !menu} onClick={() => {
                    if (!menu) return;
                    openModal({ title: locale === "ja" ? "スタッフドリンク" : "Staff Drink", maxWidth: "560px", content: <AddStaffDrink menu={menu} onAdd={(staffId, menuItemId, priceKey, quantity) => {
                        onAddStaffDrink(ticket.id, staffId, menuItemId, priceKey, quantity);
                        closeModal();
                    }} /> });
                }}>{locale === "ja" ? "スタッフドリンク +" : "Staff Drink +"}</button>
            </ItemsHeader>

            <ItemList>
                {ticket.items.map((item) => (
                    <TicketDetailItem
                        key={item.id}
                        id={item.id}
                        name={
                            item.staff_drink ? item.name : item.type === "cover"
                                ? t("coverCharge")
                                : menuLabel(
                                    locale,
                                    menu?.items.find((row) => row.id === item.menu_item_id)?.name ?? item.name,
                                )
                        }
                        unitPrice={item.unit_price}
                        quantity={item.quantity}
                        activeTab={activeTab}
                        isEditingPrice={editingPriceItemId === item.id}
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
                            onUpdatePrice(ticket.id, item.id, price);
                            setEditingPriceItemId(null);
                        }}
                    />
                ))}
            </ItemList>
        </Items>
    );
}

const Items = styled.section`
    flex: 1;

    display: flex;
    flex-direction: column;

    overflow-y: auto;
    overflow-x: visible;
`;

const ItemsHeader = styled.div`
    .staff-drink-action {
        grid-column: 1 / -1;
        justify-self: end;
        cursor: pointer;
        padding: var(--space-1);
    }
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(4.5rem, max-content) auto;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--neutral-700);

    @media (min-width: 768px) {
        padding-inline: var(--space-1);
        gap: var(--space-2);
    }
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

    scrollbar-width: none;
    -ms-overflow-style: none;

    &::-webkit-scrollbar {
        display: none;
    }
`;

const AddItemButton = styled.button`
    width: auto;
    justify-self: end;
    background: var(--royal-500);
    aspect-ratio: 1 / 1;
    padding: calc(var(--space-1) + var(--space-0));

    @media (min-width: 576px) {
        aspect-ratio: unset;
        background: var(--background-default);
        border: 1px solid var(--primary);
    }
`;

const AddItemText = styled.span`
    display: none;

    @media (min-width: 576px) {
        display: block;
    }
`;