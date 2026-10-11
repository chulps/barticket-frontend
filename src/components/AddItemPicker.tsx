// AddItemPicker.tsx

// import react stuff
import { useMemo, useState } from "react";

// import npm packages
import styled from "styled-components";

// import types
import type { MenuData, MenuItem, Prices } from "../types/Menu";

// import UI components
import SearchBar from "./MenuSearchBar";
import AddStaffDrink from "./AddStaffDrink";

// import hooks
import { useModal } from "../hooks/useModal";
import { menuHaystack, menuLabel, useI18n } from "../i18n";

type AddItemModalProps = {
    menu: MenuData;
    onAddStaffDrink: (staffId: number, menuItemId: number | null, priceKey: string, quantity: number) => void;

    onAddItem: (
        item: MenuItem,
        priceKey: keyof Prices
    ) => void;
};

// component
export default function AddItemModal({
    menu,
    onAddItem,
    onAddStaffDrink,
}: AddItemModalProps) {
    const { t, locale } = useI18n();
    const [search, setSearch] = useState("");
    const [showStaffDrink, setShowStaffDrink] = useState(false);
    const [selectedItems, setSelectedItems] = useState<
        { item: MenuItem; priceKey: keyof Prices }[]
    >([]);

    const { closeModal } = useModal();

    const handleSave = () => {
        selectedItems.forEach(({ item, priceKey }) => {
            onAddItem(item, priceKey);
        });

        closeModal();
    };

    const handleCancel = () => {
        setSelectedItems([]);
        closeModal();
    };

    const selectItem = (
        item: MenuItem,
        priceKey: keyof Prices
    ) => {
        if (item.inStock === false) return;
        setSelectedItems(prev => {
            const exists = prev.some(
                selected =>
                    selected.item.id === item.id &&
                    selected.priceKey === priceKey
            );

            if (exists) {
                return prev;
            }

            return [...prev, { item, priceKey }];
        });
    };

    const removeSelectedItem = (
        itemId: number,
        priceKey: keyof Prices
    ) => {
        setSelectedItems(prev =>
            prev.filter(
                item =>
                    !(
                        item.item.id === itemId &&
                        item.priceKey === priceKey
                    )
            )
        );
    };

    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase();


        return menu.items.filter((item) => {
            // Hide ingredient-only items
            if (item.category === "Cocktail Ingredients") {
                return false;
            }

            // No search term? Show everything else.
            if (!term) {
                return true;
            }

            return [
                item.name,
                item.brand,
                item.volume,
                item.category,
                item.subcategory,
                item.description,
                item.notes,
                item.tags?.join(" "),
            ].map((field) => menuHaystack(field))
                .filter(Boolean)
                .some((field) => field!.toLowerCase().includes(term));
        });
    }, [menu, search]);

    return (
        <>
            <ModeSwitch>
                <button type="button" className={!showStaffDrink ? "selected" : ""} aria-pressed={!showStaffDrink} onClick={() => setShowStaffDrink(false)}>{locale === "ja" ? "メニュー" : "Menu"}</button>
                <button type="button" className={showStaffDrink ? "selected" : ""} aria-pressed={showStaffDrink} onClick={() => setShowStaffDrink(true)}>{locale === "ja" ? "スタッフドリンク" : "Staff Drink"}</button>
            </ModeSwitch>
            {showStaffDrink ? <AddStaffDrink menu={menu} onAdd={(staffId, menuItemId, priceKey, quantity) => {
                onAddStaffDrink(staffId, menuItemId, priceKey, quantity);
                closeModal();
            }} /> : <>
            <SearchBarContainer>
                <SearchBar
                    value={search}
                    onChange={setSearch}
                />
            </SearchBarContainer>

            <SelectedItems>
                {selectedItems.map(selection => (
                    <Chip
                        className="small"
                        key={`${selection.item.id}-${selection.priceKey}`}
                        onClick={() =>
                            removeSelectedItem(
                                selection.item.id,
                                selection.priceKey
                            )
                        }
                    >
                        {menuLabel(locale, selection.item.name)} ✕
                    </Chip>
                ))}
            </SelectedItems>

            <ItemList>
                {filteredItems.map((item) => {
                    const unavailable = item.inStock === false;
                    if (!item.prices && !unavailable) {
                        console.warn("Menu item missing prices:", item);
                        return null;
                    }

                    const standardPrice = item.prices?.standard;
                    let priceControl = (
                        <PriceButtons>
                            {item.prices?.["15ml"] !== undefined && (
                                <PriceButton
                                    className="small hollow"
                                    onClick={() => selectItem(item, "15ml")}
                                >
                                    15ml · ¥{item.prices["15ml"]!.toLocaleString()}
                                </PriceButton>
                            )}

                            {item.prices?.["30ml"] !== undefined && (
                                <PriceButton
                                    className="small hollow"
                                    onClick={() => selectItem(item, "30ml")}
                                >
                                    30ml · ¥{item.prices["30ml"]!.toLocaleString()}
                                </PriceButton>
                            )}
                        </PriceButtons>
                    );
                    if (unavailable) {
                        priceControl = <OutOfStock>{t("outOfStock")}</OutOfStock>;
                    } else if (standardPrice !== undefined && item.prices) {
                        priceControl = (
                            <PriceButton
                                className="small hollow"
                                onClick={() => selectItem(item, "standard")}
                            >
                                ¥{item.prices.standard!.toLocaleString()}
                            </PriceButton>
                        );
                    }

                    return (
                        <ItemRow key={item.id} $available={!unavailable}>
                            <ItemName>{menuLabel(locale, item.name)}</ItemName>
                            {priceControl}
                        </ItemRow>
                    );
                })}
            </ItemList>

            {
                selectedItems.length > 0 && (
                    <Footer>
                        <CancelButton onClick={handleCancel}>
                            {t("cancel")}
                        </CancelButton>

                        <SaveButton onClick={handleSave}>
                            {t("saveCount", { count: selectedItems.length })}
                        </SaveButton>
                    </Footer>
                )
            }
            </>}
        </>
    );
}


const ItemList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    height: 90%;
    overflow-y: auto;
`;

const ItemRow = styled.div<{ $available?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-2);
    background: transparent;
    border: none;
    border-radius: var(--space-1);
    text-align: left;
    cursor: ${({ $available }) => ($available === false ? "default" : "pointer")};
    gap: var(--space-2);
    &:hover {
        background: var(--neutral-800);
    }
`;

const ItemName = styled.p`
  font-weight: normal;
`;

const OutOfStock = styled.span`
  color: var(--danger-400);
  font-size: 12px;
  white-space: nowrap;
`;

const PriceButtons = styled.div`
  display: flex;
  gap: var(--space-1);
`;

const PriceButton = styled.button`
  width: auto;
`;

const SearchBarContainer = styled.div`
    padding: 0 var(--space-2);
    position: sticky;
    top: 0;
    width: 100%;
    z-index: 1000;
`

const SelectedItems = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: var(--space-2);
`;

const Chip = styled.button`
  padding: var(--space-1) var(--space-2);
  border-radius: 999px;
  border: none;
  background: var(--neutral-600);
  color: white;
  display: flex;
  gap: var(--space-2);

  &:hover {
    background: var(--neutral-500);
  }
`;

const Footer = styled.footer`  position: sticky;
  bottom: 0;

  display: flex;
  gap: var(--space-2);

  padding: var(--space-2);

  background: var(--neutral-900);
  border-top: 1px solid var(--neutral-700);

`;

const SaveButton =styled.button `
    border: 1px solid var(--success-500);
    background: var(--success-900);
    flex: 1;
`

const CancelButton =styled.button `
    background: var(--danger-950);
    border: 1px solid var(--danger-500);
    flex: 1;
`

const ModeSwitch = styled.div`
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    button {
        flex: 1;
        min-height: 44px;
        padding: var(--space-1);
        background: transparent;
        border: 1px solid var(--neutral-700);
        border-radius: 6px;
        transform: none;
    }
    button:hover, button:active { transform: none; filter: none; background: var(--neutral-800); color: white; }
    button.selected, button.selected:hover { background: var(--royal-500); color: white; }
`;
