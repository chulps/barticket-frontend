// TicketItems.tsx

// import react stuff
import type { Dispatch, SetStateAction } from "react";

// npm packages
import styled from "styled-components";

// UI components
import TicketDetailItem from "./TicketItem";
import CoverChargeModal, { type CoverAdjustment } from "./CoverChargeModal";
import Icon from "../Icon";
import AddItemPicker from "../AddItemPicker";

// Types
import type { MenuData, MenuItem, Prices } from "../../types/Menu";
import type { Ticket } from "../../types/Ticket";

// Hooks
import { useModal } from "../../hooks/useModal";
import { menuLabel, useI18n } from "../../i18n";

type TicketItemsProps = {
    ticket: Ticket;
    menu: MenuData | null;
    tickets: Ticket[];
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
    ) => Promise<boolean>;

    onRemoveItem: (
        ticketId: number,
        itemId: number
    ) => void;

    onAddStaffDrink: (ticketId: number, staffId: number, menuItemId: number | null, priceKey: string, quantity: number, details?: { name: string; staffName: string; price: number }) => Promise<boolean>;
    onAdjustCover: (ticketId: number, adjustment: CoverAdjustment) => Promise<boolean>;

    onAddItem: (
        ticketId: number,
        menuItem: MenuItem,
        priceKey: keyof Prices,
        unitPrice: number,
        quantity: number
    ) => Promise<boolean>;
};

export default function TicketItems({
    ticket,
    menu,
    tickets,
    activeTab,
    editingPriceItemId,
    setEditingPriceItemId,
    onUpdateQuantity,
    onUpdatePrice,
    onRemoveItem,
    onAddItem,
    onAddStaffDrink,
    onAdjustCover,
}: TicketItemsProps) {
    const { openModal } = useModal();
    const { t, locale } = useI18n();

    const isEditable = activeTab === "open";
    function openCoverModal(mode: "returning" | "waiver") {
        openModal({
            title: mode === "waiver"
                ? (locale === "ja" ? "カバー料金を免除" : "Waive cover charge")
                : (locale === "ja" ? "再来店のカバー調整" : "Returning guest cover"),
            maxWidth: "560px", fitContent: true,
            content: <CoverChargeModal ticket={ticket} tickets={tickets} mode={mode}
                onCancel={closeModal}
                onSave={async adjustment => {
                    const saved = await onAdjustCover(ticket.id, adjustment);
                    if (saved) closeModal();
                    return saved;
                }} />,
        });
    }

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
                                    tickets={tickets}
                                    onAddStaffDrink={(staffId, menuItemId, priceKey, quantity, details) =>
                                        onAddStaffDrink(ticket.id, staffId, menuItemId, priceKey, quantity, details)}
                                    onAddItem={(item, priceKey, quantity) => {
                                        const unitPrice = item.prices[priceKey];

                                        if (unitPrice === undefined) return Promise.resolve(false);

                                        return onAddItem(
                                            ticket.id,
                                            item,
                                            priceKey,
                                            unitPrice,
                                            quantity
                                        );
                                    }}
                                />
                            ),
                        });
                    }}
                >
                    <Icon name="Plus" />
                    <AddItemText>{t("addItem")}</AddItemText>
                </AddItemButton>
            </ItemsHeader>

            <ItemList>
                {ticket.items.map((item) => (
                    <TicketDetailItem
                        key={item.id}
                        id={item.id}
                        pending={!Number.isInteger(item.id)}
                        name={
                            item.staff_drink
                                ? [item.staff_name, item.drink_name].filter(Boolean).join(" · ") || item.name
                                : item.type === "cover"
                                    ? t("coverCharge") +
                                        ((ticket.waivedCoverCount ?? 0) ? ` · ${ticket.waivedCoverCount} ${locale === "ja" ? "免除" : "waived"}` : "") +
                                        ((ticket.returningGuestCount ?? 0) ? ` · ${ticket.returningGuestCount} ${locale === "ja" ? "再来店" : "returning"}` : "")
                                    : menuLabel(
                                        locale,
                                        activeTab === "open"
                                            ? (menu?.items.find((row) => row.id === item.menu_item_id)?.name ?? item.name)
                                            : item.name,
                                    )
                        }
                        unitPrice={item.unit_price}
                        quantity={item.quantity}
                        subtotal={item.subtotal}
                        isCover={item.type === "cover"}
                        onWaiveCover={() => openCoverModal("waiver")}
                        onReturningCustomer={() => openCoverModal("returning")}
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
                        onSavePrice={async (price) => {
                            const saved = await onUpdatePrice(ticket.id, item.id, price);
                            if (saved) setEditingPriceItemId(null);
                            return saved;
                        }}
                        onCancelPrice={() => setEditingPriceItemId(null)}
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
    display: grid;
    grid-template-columns: 25% 25% 25% 25%;
    align-items: center;
    column-gap: 0;
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--neutral-700);

    @media (min-width: 768px) {
        padding-inline: var(--space-1);
        column-gap: 0;
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
    min-height: 0;
    min-width: 0;
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
    grid-column: 4;
    justify-self: end;
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