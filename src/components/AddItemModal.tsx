// AddItemModal.tsx

import styled from "styled-components";
import { useMemo, useState } from "react";
import SearchBar from "../components/MenuSearchBar";

//types
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

type AddItemModalProps = {
    menu: MenuData;

    onAddItem: (
        item: MenuItem,
        priceKey: keyof Prices
    ) => void;

    onClose: () => void;
};

// component
export default function AddItemModal({
    menu,
    onAddItem,
    onClose,
}: AddItemModalProps) {
    const [search, setSearch] = useState("");

    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase();

        if (!term) {
            return menu.items.filter(
                (item) =>
                    item.inStock &&
                    item.category !== "Cocktail Ingredients"
            );
        }

        return menu.items.filter((item) => {

            if (
                !item.inStock ||
                item.category === "Cocktail Ingredients"
            ) {
                return false;
            }

            return [
                item.name,
                item.category,
                item.subcategory,
                item.description,
                item.notes,
            ]
                .filter(Boolean)
                .some(field =>
                    field!.toLowerCase().includes(term)
                );
        });
    }, [menu, search]);

    return (
        <Overlay onClick={onClose}>
            <Modal onClick={(e) => e.stopPropagation()}>
                <Header>
                    <h2>Add Item</h2>

                    <button
                        className="small hollow secondary"
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </Header>

                <SearchBar
                    value={search}
                    onChange={setSearch}
                />

                <ItemList>
                    {filteredItems.map((item) => {
                        if (!item.prices) {
                            console.warn("Menu item missing prices:", item);
                            return null;
                        }

                        return (
                            <ItemRow key={item.id}>
                                <ItemName>{item.name}</ItemName>

                                {item.prices.standard !== undefined ? (
                                    <PriceButton
                                        className="small secondary"
                                        onClick={() =>
                                            onAddItem(item, "standard")
                                        }
                                    >
                                        ¥{item.prices.standard.toLocaleString()}
                                    </PriceButton>
                                ) : (
                                    <PriceButtons>
                                        {item.prices["15ml"] !== undefined && (
                                            <PriceButton
                                                className="small secondary"
                                                onClick={() =>
                                                    onAddItem(item, "15ml")
                                                }
                                            >
                                                15ml · ¥{item.prices["15ml"]!.toLocaleString()}
                                            </PriceButton>
                                        )}

                                        {item.prices["30ml"] !== undefined && (
                                            <PriceButton
                                                className="small secondary"
                                                onClick={() =>
                                                    onAddItem(item, "30ml")
                                                }
                                            >
                                                30ml · ¥{item.prices["30ml"]!.toLocaleString()}
                                            </PriceButton>
                                        )}
                                    </PriceButtons>
                                )}
                            </ItemRow>
                        );
                    })}
                </ItemList>
            </Modal>
        </Overlay>
    );
}

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
`;

const Modal = styled.div`
    background: var(--neutral-900);
    padding: var(--space-3);
    border-radius: var(--space-2);
    min-width: 500px;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
`;

const ItemList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: var(--space-3);
    max-height: 500px;
    overflow-y: auto;
`;

const ItemRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-2);
    background: transparent;
    border: none;
    border-radius: var(--space-1);
    text-align: left;
    cursor: pointer;
    &:hover {
        background: var(--neutral-800);
    }
`;

const ItemName = styled.small`
  font-weight: normal;
`;

const PriceButtons = styled.div`
  display: flex;
  gap: var(--space-1);
`;

const PriceButton = styled.button`
  width: auto;
`;