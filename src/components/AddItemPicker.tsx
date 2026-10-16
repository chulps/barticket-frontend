import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import type { MenuData, MenuItem, Prices } from "../types/Menu";
import type { Ticket } from "../types/Ticket";
import { topSellingDrinks } from "./topDrinks";
import SearchBar from "./MenuSearchBar";
import AddStaffDrink from "./AddStaffDrink";
import { useModal } from "../hooks/useModal";
import { menuHaystack, menuLabel, useI18n } from "../i18n";
import { addSelection, changeSelectionQuantity, type SelectedDrink } from "./quickEntry";
import { notifyMutation } from "../utils/mutationFeedback";

type AddItemPickerProps = {
    menu: MenuData;
    tickets: Ticket[];
    onAddStaffDrink: (staffId: number, menuItemId: number | null, priceKey: string, quantity: number, details?: { name: string; staffName: string; price: number }) => Promise<boolean>;
    onAddItem: (item: MenuItem, priceKey: keyof Prices, quantity: number) => Promise<boolean>;
};

export default function AddItemPicker({ menu, tickets, onAddItem, onAddStaffDrink }: AddItemPickerProps) {
    const { t, locale } = useI18n();
    const { closeModal, forceCloseModal, registerCloseGuard } = useModal();
    const [search, setSearch] = useState("");
    const [showStaffDrink, setShowStaffDrink] = useState(false);
    const [selectedItems, setSelectedItems] = useState<SelectedDrink[]>([]);
    const submitting = useRef(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        registerCloseGuard(() => !submitting.current);
        return () => registerCloseGuard(null);
    }, [registerCloseGuard]);

    const handleSave = async () => {
        if (submitting.current || selectedItems.length === 0) return;
        submitting.current = true;
        setSaving(true);
        setError("");
        const failures: SelectedDrink[] = [];
        let confirmed = 0;
        // Each line is a separate existing API operation, not one atomic batch.
        for (const selection of selectedItems) {
            try {
                if (await onAddItem(selection.item, selection.priceKey, selection.quantity)) confirmed++;
                else failures.push(selection);
            } catch {
                failures.push(selection);
            }
        }
        submitting.current = false;
        setSaving(false);
        if (failures.length === 0) {
            notifyMutation("success", locale === "ja"
                ? `${confirmed}種類の商品を伝票に追加しました`
                : `${confirmed} item type(s) added to ticket`);
            forceCloseModal();
            return;
        }
        setSelectedItems(failures);
        const message = locale === "ja"
            ? `${confirmed}件を確認しました。${failures.length}件は未確認です。再操作する前に伝票をご確認ください。`
            : `${confirmed} confirmed; ${failures.length} unconfirmed. Check the ticket before trying again.`;
        setError(message);
        notifyMutation("error", message);
    };

    const groups = useMemo(() => {
        const term = search.trim().toLowerCase();
        const matches = menu.items.filter((item) =>
            !term || [
                item.name, item.brand, item.volume, item.category, item.subcategory,
                item.description, item.notes, item.tags?.join(" "),
            ].map(menuHaystack).filter(Boolean).some((field) => field.toLowerCase().includes(term)),
        );
        return matches.filter((item) => item.category !== "Cocktail Ingredients");
    }, [menu, search]);

    const topDrinks = useMemo(() => topSellingDrinks(tickets, menu.items), [tickets, menu]);
    const topIds = new Set(topDrinks.map((item) => item.id));

    const renderItem = (item: MenuItem) => {
        const unavailable = item.inStock === false;
        const options = (["standard", "15ml", "30ml"] as const)
            .filter((key) => item.prices?.[key] !== undefined);
        if (options.length === 0 && !unavailable) return null;
        return (
            <ItemRow key={item.id} $available={!unavailable}>
                <ItemName>{menuLabel(locale, item.name)}</ItemName>
                {unavailable ? <OutOfStock>{t("outOfStock")}</OutOfStock> : (
                    <PriceButtons>
                        {options.map((priceKey) => (
                            <PriceButton key={priceKey} type="button" className="small hollow"
                                onClick={() => {
                                    if (saving) return;
                                    setSelectedItems((previous) => addSelection(previous, item, priceKey));
                                    setSearch("");
                                }}>
                                {priceKey === "standard" ? "" : priceKey + " · "}
                                ¥{item.prices[priceKey]!.toLocaleString()}
                            </PriceButton>
                        ))}
                    </PriceButtons>
                )}
            </ItemRow>
        );
    };

    return (
        <>
            <ModeSwitch>
                <button type="button" className={!showStaffDrink ? "selected" : ""} aria-pressed={!showStaffDrink}
                    disabled={saving} onClick={() => setShowStaffDrink(false)}>{locale === "ja" ? "メニュー" : "Menu"}</button>
                <button type="button" className={showStaffDrink ? "selected" : ""} aria-pressed={showStaffDrink}
                    disabled={saving} onClick={() => setShowStaffDrink(true)}>{locale === "ja" ? "スタッフドリンク" : "Staff Drink"}</button>
            </ModeSwitch>
            {showStaffDrink ? <AddStaffDrink menu={menu} onAdd={(staffId, menuItemId, priceKey, quantity, details) => {
                return onAddStaffDrink(staffId, menuItemId, priceKey, quantity, details).then(confirmed => {
                    if (confirmed) {
                        notifyMutation("success", locale === "ja" ? "スタッフドリンクを追加しました" : "Staff drink added");
                        forceCloseModal();
                    }
                    return confirmed;
                });
            }} /> : <>
                <SearchBarContainer><SearchBar value={search} onChange={setSearch} /></SearchBarContainer>
                {selectedItems.length > 0 && (
                    <SelectedItems aria-label={locale === "ja" ? "選択した商品" : "Selected drinks"}>
                        {selectedItems.map(({ item, priceKey, quantity }) => (
                            <Selection key={item.id + "-" + priceKey}>
                                <SelectionLabel>{menuLabel(locale, item.name)}{priceKey !== "standard" ? " · " + priceKey : ""}</SelectionLabel>
                                <QuantityButton type="button" aria-label="Decrease quantity"
                                    disabled={saving} onClick={() => setSelectedItems((current) => changeSelectionQuantity(current, item.id, priceKey, -1))}>−</QuantityButton>
                                <span aria-label="Quantity">{quantity}</span>
                                <QuantityButton type="button" aria-label="Increase quantity" disabled={saving || quantity >= 99}
                                    onClick={() => setSelectedItems((current) => changeSelectionQuantity(current, item.id, priceKey, 1))}>+</QuantityButton>
                            </Selection>
                        ))}
                    </SelectedItems>
                )}
                <ItemList>
                    {!search.trim() && topDrinks.length > 0 && (
                        <section>
                            <SectionTitle>{locale === "ja" ? "人気のドリンク TOP 3 · 過去30日間" : "Top 3 drinks · Last 30 days"}</SectionTitle>
                            {topDrinks.map(renderItem)}
                        </section>
                    )}
                    <section>
                        <SectionTitle>{search.trim() ? (locale === "ja" ? "検索結果" : "Search results") : (locale === "ja" ? "すべての商品" : "All drinks")}</SectionTitle>
                        {groups.filter((item) => search.trim() || !topIds.has(item.id)).map(renderItem)}
                    </section>
                </ItemList>
                {error ? <BatchError role="alert">{error}</BatchError> : null}
                {selectedItems.length > 0 && (
                    <Footer>
                        <CancelButton type="button" disabled={saving} onClick={closeModal}>{t("cancel")}</CancelButton>
                        <SaveButton type="button" disabled={saving} onClick={() => void handleSave()}>
                            {saving ? (locale === "ja" ? "追加中…" : "Adding…")
                                : t("saveCount", { count: selectedItems.reduce((sum, item) => sum + item.quantity, 0) })}
                        </SaveButton>
                    </Footer>
                )}
            </>}
        </>
    );
}

const ItemList = styled.div`
    display: flex; flex-direction: column; gap: var(--space-2);
    min-height: 0; min-width: 0; flex: 1; overflow-y: auto;
    overscroll-behavior: contain;
`;
const SectionTitle = styled.h4`
    position: sticky; top: 0; z-index: 1;
    padding: var(--space-1) var(--space-2); margin: 0;
    background: var(--neutral-900); color: var(--neutral-300);
`;
const ItemRow = styled.div<{ $available: boolean }>`
    display: flex; align-items: center; width: 100%; gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--neutral-800);
    opacity: ${({ $available }) => $available ? 1 : 0.65};
`;
const ItemName = styled.p`font-weight: normal; flex: 1; min-width: 0; margin: 0;`;
const OutOfStock = styled.span`color: var(--danger-400); font-size: 12px; white-space: nowrap;`;
const PriceButtons = styled.div`display: flex; gap: var(--space-1); flex-wrap: wrap; justify-content: end;`;
const PriceButton = styled.button`width: auto; min-height: 44px; white-space: nowrap;`;
const SearchBarContainer = styled.div`
    position: sticky; top: 0; z-index: 5;
    padding: var(--space-1) var(--space-2);
    background: var(--neutral-900);
`;
const SelectedItems = styled.div`
    display: flex; flex-wrap: wrap; gap: var(--space-1);
    padding: var(--space-2); max-height: 30dvh; overflow-y: auto;
`;
const Selection = styled.div`
    display: flex; align-items: center; gap: var(--space-1);
    padding: 2px var(--space-1); border-radius: var(--space-1);
    background: var(--neutral-700);
`;
const SelectionLabel = styled.span`font-size: 0.85rem;`;
const QuantityButton = styled.button`
    width: 34px; min-height: 38px; padding: 0;
    border: 1px solid var(--neutral-500); background: var(--neutral-800);
`;
const Footer = styled.footer`
    position: sticky; bottom: 0; display: flex; gap: var(--space-2);
    padding: var(--space-2); padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px)); background: var(--neutral-900);
    border-top: 1px solid var(--neutral-700);
`;
const SaveButton = styled.button`
    border: 1px solid var(--success-500); background: var(--success-900); flex: 1;
`;
const CancelButton = styled.button`
    background: var(--danger-950); border: 1px solid var(--danger-500); flex: 1;
`;
const ModeSwitch = styled.div`
    display: flex; gap: var(--space-1); padding: var(--space-1) var(--space-2);
    button { flex: 1; min-height: 44px; padding: var(--space-1); background: transparent;
        border: 1px solid var(--neutral-700); border-radius: 6px; transform: none; }
    button:hover, button:active { transform: none; filter: none; background: var(--neutral-800); color: white; }
    button.selected, button.selected:hover { background: var(--royal-500); color: white; }
`;

const BatchError = styled.p`
    margin: var(--space-1) var(--space-2);
    color: var(--danger-300);
    font-size: var(--font-size-small);
`;
