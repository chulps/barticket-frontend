// AddItemModal.tsx

// import react stuff
import { useMemo, useState } from "react";

// import npm packages
import styled from "styled-components";

// import types
import type { MenuData, MenuItem, Prices } from "../types/Menu";

// import UI components
import SearchBar from "../components/MenuSearchBar";

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
                    item.inStock !== false &&
                    !item.cocktailIngredient
            );
        }

        return menu.items.filter((item) => {

            if (
                item.inStock === false ||
                item.cocktailIngredient === true
            ) {
                return false;
            }

            return [
                item.name,
                item.category,
                item.subcategory,
                item.description,
                item.notes,
                item.tags?.join(" ")
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
                    <h4>Add Item</h4>

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
                                        className="small hollow"
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
                                                className="small hollow"
                                                onClick={() =>
                                                    onAddItem(item, "15ml")
                                                }
                                            >
                                                15ml · ¥{item.prices["15ml"]!.toLocaleString()}
                                            </PriceButton>
                                        )}

                                        {item.prices["30ml"] !== undefined && (
                                            <PriceButton
                                                className="small hollow"
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
    backdrop-filter: blur(10px);
    z-index: 10000
`;

const Modal = styled.div`
    background: var(--neutral-900);
    padding: var(--space-2) var(--space-2) 0 var(--space-2);
    width: 100%;
    height: 100%;
    max-width: var(--space-7);
    overflow: hidden auto;
    display: flex;
    flex-direction: column;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const ItemList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    height: 90%;
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
    gap: var(--space-2);
    &:hover {
        background: var(--neutral-800);
    }
`;

const ItemName = styled.p`
  font-weight: normal;
`;

const PriceButtons = styled.div`
  display: flex;
  gap: var(--space-1);
`;

const PriceButton = styled.button`
  width: auto;
`;