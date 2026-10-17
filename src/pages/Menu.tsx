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
import { notifyMutation } from "../utils/mutationFeedback";


type MenuProps = {
  authenticated: boolean;
  menu: MenuData | null;
  loadingMenu: boolean;
  menuError: boolean;
  onToggleStock: (item: MenuItem) => Promise<boolean>;
  onSavePrices: (item: MenuItem, prices: Prices) => Promise<boolean>;
  pendingMenuIds: number[];
  onItemAdded: (item: MenuItem) => void;
};

export default function Menu({
  authenticated,
  menu,
  loadingMenu,
  menuError,
  onToggleStock,
  onSavePrices,
  pendingMenuIds,
  onItemAdded,
}: MenuProps) {
  const { t, locale } = useI18n();
  const retryMenu = () => window.dispatchEvent(new Event("barticket-retry-menu"));
  const { openModal } = useModal();
  const [searchTerm, setSearchTerm] = useState("");
  async function toggleStock(item: MenuItem) {
    try {
      const saved = await onToggleStock(item);
      if (saved) {
        window.dispatchEvent(new Event("barticket-notices"));
        notifyMutation("success", locale === "ja" ? "在庫状況を更新しました" : "Stock status updated");
      }
    } catch {
      notifyMutation("error", locale === "ja" ? "在庫状況を更新できませんでした" : t("stockUpdateFailed"));
    }
  }

  async function savePrices(item: MenuItem, prices: Prices) {
    try {
      const saved = await onSavePrices(item, prices);
      if (!saved) throw new Error("Menu item is already being updated");
      notifyMutation("success", locale === "ja" ? "メニュー価格を保存しました" : "Menu prices saved");
    } catch (error) {
      notifyMutation("error", locale === "ja" ? "価格を保存できませんでした" : t("priceUpdateFailed"));
      throw error;
    }
  }

  const groupedMenu = useFilteredMenu(menu, searchTerm);

  if (loadingMenu) {
    return <main role="status" aria-live="polite"><h2>{t("loading")}</h2></main>;
  }

  if (!menu) {
    return <main>
      <h2>{t("drinkMenu")}</h2>
      <p role="alert">{menuError
        ? (locale === "ja" ? "メニューを読み込めませんでした。接続を確認して再試行してください。" : "Could not load the menu. Check your connection and retry.")
        : t("noMenu")}</p>
      {menuError ? <button type="button" className="small secondary" onClick={retryMenu}>
        {locale === "ja" ? "再試行" : "Retry"}
      </button> : null}
    </main>;
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
      {menuError ? (
        <LoadWarning role="alert">
          {locale === "ja" ? "メニューの更新に失敗しました。表示中の情報が古い可能性があります。" : "Menu refresh failed; displayed prices or stock may be outdated."}
          <button type="button" className="small hollow secondary" onClick={retryMenu}>{locale === "ja" ? "再試行" : "Retry"}</button>
        </LoadWarning>
      ) : null}
      <MenuHeader>
        <h2>{t("drinkMenu")}</h2>
        {authenticated ? (
          <AddButton type="button" className="small" onClick={openAddDrink}>
            <Icon name="Plus" />
            {t("addDrink")}
          </AddButton>
        ) : null}
      </MenuHeader>

      <StickySearch>
        <SearchBar value={searchTerm} onChange={setSearchTerm} />
      </StickySearch>

      <MenuGridContainer>
        {Object.entries(groupedMenu).map(([category, subcategories]) => (
          <MenuCategory
            key={category}
            category={category}
            subcategories={subcategories}
            onToggleStock={authenticated ? toggleStock : undefined}
            onSavePrices={authenticated ? savePrices : undefined}
            pendingMenuIds={pendingMenuIds}
            categories={Array.from(new Set(menuItems.map(item => item.category)))}
            allSubcategories={Array.from(new Set(menuItems.map(item => item.subcategory).filter((value): value is string => Boolean(value))))}
          />
        ))}
      </MenuGridContainer>
    </main>
  );
}


const StickySearch = styled.div`
  position: sticky;
  top: 64px;
  z-index: 90; /* below the sticky app header (100), menus (1200) and modals (1000) */
  padding: var(--space-1) 0;
  background: var(--neutral-950);
  @media (min-width: 768px) { top: 56px; }
`;

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
const LoadWarning = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--danger-500);
  border-radius: var(--space-1);
  button { width: auto; }
`;
