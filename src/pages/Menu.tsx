import { useState } from "react";
import styled from "styled-components";

// imported components
import SearchBar from "../components/MenuSearchBar";
import MenuCategory from "../components/MenuCategory";
import MenuItemForm from "../components/MenuItemForm";
import Icon from "../components/Icon";

// import Menu data types
import type { MenuData, MenuItem, Prices } from "../types/Menu";

import { useFilteredMenu } from "../hooks/useFilteredMenu";
import { useModal } from "../hooks/useModal";
import { useI18n } from "../i18n";
import { ApiError } from "../api/client";


type MenuProps = {
  authenticated: boolean;
  menu: MenuData | null;
  loadingMenu: boolean;
  onToggleStock: (item: MenuItem) => Promise<boolean>;
  onSavePrices: (item: MenuItem, prices: Prices) => Promise<boolean>;
  pendingMenuIds: number[];
  onItemAdded: (item: MenuItem) => void;
};

export default function Menu({
  authenticated,
  menu,
  loadingMenu,
  onToggleStock,
  onSavePrices,
  pendingMenuIds,
  onItemAdded,
}: MenuProps) {
  const { t } = useI18n();
  const { openModal } = useModal();
  const [searchTerm, setSearchTerm] = useState("");
  async function toggleStock(item: MenuItem) {
    try {
      const saved = await onToggleStock(item);
      if (saved) window.dispatchEvent(new Event("barticket-notices"));
    } catch (error) {
      window.alert(error instanceof ApiError ? error.message : t("stockUpdateFailed"));
    }
  }

  async function savePrices(item: MenuItem, prices: Prices) {
    try {
      const saved = await onSavePrices(item, prices);
      if (!saved) throw new Error("Menu item is already being updated");
    } catch (error) {
      window.alert(error instanceof ApiError ? error.message : t("priceUpdateFailed"));
      throw error;
    }
  }

  const groupedMenu = useFilteredMenu(menu, searchTerm);

  if (loadingMenu) {
    return <h1>{t("loading")}</h1>;
  }

  if (!menu) {
    return <h1>{t("noMenu")}</h1>;
  }

  const menuItems = menu.items;

  function openAddDrink() {
    const categories = Array.from(new Set(menuItems.map((item) => item.category))).sort();
    const subcategories = Array.from(
      new Set(
        menuItems
          .map((item) => item.subcategory)
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort();
    openModal({
      title: t("addDrink"),
      maxWidth: "480px",
      fitContent: true,
      content: (
        <MenuItemForm
          categories={categories}
          subcategories={subcategories}
          onCreated={onItemAdded}
        />
      ),
    });
  }

  return (
    <main>
      <MenuHeader>
        <h2>{t("drinkMenu")}</h2>
        {authenticated ? (
          <AddButton type="button" className="small" onClick={openAddDrink}>
            <Icon name="Plus" />
            {t("addDrink")}
          </AddButton>
        ) : null}
      </MenuHeader>

      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
      />

      <MenuGridContainer>
        {Object.entries(groupedMenu).map(([category, subcategories]) => (
          <MenuCategory
            key={category}
            category={category}
            subcategories={subcategories}
            onToggleStock={authenticated ? toggleStock : undefined}
            onSavePrices={authenticated ? savePrices : undefined}
            pendingMenuIds={pendingMenuIds}
          />
        ))}
      </MenuGridContainer>
    </main>
  );
}


const MenuHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: var(--space-2);
  margin-bottom: var(--space-3);

  h2 {
    margin: 0;
  }

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const AddButton = styled.button`
  width: auto;
`;

const MenuGridContainer = styled.section`
  columns: 100%;
  margin-top: var(--space-3);
    column-gap: var(--space-4);

  @media (min-width: 768px) {
    columns: var(--space-6);
  }
  `