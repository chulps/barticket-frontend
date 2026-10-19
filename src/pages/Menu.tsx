import { useState } from "react";
import styled from "styled-components";
import RequestState from "../components/RequestState";

// imported components
import SearchBar from "../components/MenuSearchBar";
import MenuCategory from "../components/MenuCategory";
import MenuItemForm from "../components/MenuItemForm";
import Icon from "../components/Icon";
import DataDownload from "../components/DataDownload";

// import Menu data types
import type { MenuData, MenuItem, Prices } from "../types/Menu";
import type { MenuItemEdit } from "../api/menu";
import { getArchivedMenuItems } from "../api/menu";

import { useFilteredMenu } from "../hooks/useFilteredMenu";
import { useModal } from "../hooks/useModal";
import { menuHaystack, menuLabel, useI18n } from "../i18n";
import { notifyMutation } from "../utils/mutationFeedback";


type MenuProps = {
  authenticated: boolean;
  menu: MenuData | null;
  loadingMenu: boolean;
  menuError: boolean;
  onToggleStock: (item: MenuItem) => Promise<boolean>;
  onSavePrices: (item: MenuItem, prices: Prices) => Promise<boolean>;
  onSaveItem: (item: MenuItem, input: MenuItemEdit) => Promise<boolean>;
  onArchiveItem: (item: MenuItem) => Promise<boolean>;
  onRestoreItem: (item: MenuItem) => Promise<boolean>;
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
  onSaveItem,
  onArchiveItem,
  onRestoreItem,
  pendingMenuIds,
  onItemAdded,
}: MenuProps) {
  const { t, locale } = useI18n();
  const retryMenu = () => window.dispatchEvent(new Event("barticket-retry-menu"));
  const { openModal } = useModal();
  const [searchTerm, setSearchTerm] = useState("");
  const [archivedMode, setArchivedMode] = useState(false);
  const [archivedItems, setArchivedItems] = useState<MenuItem[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedError, setArchivedError] = useState("");
  const [restoringId, setRestoringId] = useState<number | null>(null);

  async function viewArchive() {
    if (!authenticated || archivedLoading) return;
    if (archivedMode) { setArchivedMode(false); return; }
    setArchivedMode(true);
    setArchivedLoading(true);
    setArchivedError("");
    try {
      const result = await getArchivedMenuItems();
      setArchivedItems(result.items);
    } catch {
      setArchivedError(locale === "ja"
        ? "アーカイブを読み込めません。バックエンドの更新状況と接続を確認してください。"
        : "Archived items could not be loaded. Check the backend release and connection.");
    } finally {
      setArchivedLoading(false);
    }
  }

  async function archiveItem(item: MenuItem): Promise<boolean> {
    const saved = await onArchiveItem(item);
    if (saved) {
      notifyMutation("success", locale === "ja" ? "商品をアーカイブしました" : "Item archived");
      setArchivedItems(rows => [...rows.filter(row => row.id !== item.id), { ...item, archived: true }]
        .sort((a, b) => a.id - b.id));
    }
    return saved;
  }

  async function restoreItem(item: MenuItem) {
    if (restoringId !== null) return;
    const confirmed = window.confirm(locale === "ja"
      ? menuLabel(locale, item.name) + " を販売メニューに復元しますか？"
      : "Restore " + item.name + " to the active menu?");
    if (!confirmed) return;
    setRestoringId(item.id);
    setArchivedError("");
    try {
      if (!(await onRestoreItem(item))) throw new Error("Restore not confirmed");
      setArchivedItems(rows => rows.filter(row => row.id !== item.id));
      notifyMutation("success", locale === "ja" ? "商品を復元しました" : "Item restored to menu");
    } catch {
      setArchivedError(locale === "ja"
        ? "復元を確認できませんでした。再試行する前にメニューを確認してください。"
        : "Could not confirm restore. Refresh the menu before retrying.");
    } finally {
      setRestoringId(null);
    }
  }
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
  const archiveSearch = searchTerm.trim().toLowerCase();
  const filteredArchived = archivedItems.filter(item =>
    !archiveSearch || [
      item.name, item.category, item.subcategory, item.brand, item.volume,
      item.description, item.notes, ...(item.tags ?? []),
    ].some(value => menuHaystack(value).toLowerCase().includes(archiveSearch))
  );

  if (loadingMenu) {
    return <main><RequestState kind="loading" detail={t("loading")} /></main>;
  }

  if (!menu) {
    return <main>
      <h2>{t("drinkMenu")}</h2>
      <RequestState kind={menuError ? "error" : "empty"}
        detail={menuError
          ? (locale === "ja" ? "メニューを読み込めませんでした。接続を確認して再試行してください。" : "Could not load the menu. Check your connection and refresh.")
          : t("noMenu")}
        onRetry={menuError ? retryMenu : undefined} />
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
        {authenticated ? <HeaderActions>
          <button type="button" className="small hollow secondary" disabled={archivedLoading}
            aria-pressed={archivedMode} onClick={() => void viewArchive()}>
            <Icon name="Archive" />
            {archivedMode ? (locale === "ja" ? "販売メニューに戻る" : "Active Menu")
              : (locale === "ja" ? "アーカイブ済み商品" : "Archived Items")}
          </button>
          {!archivedMode && <AddButton type="button" className="small" onClick={openAddDrink}>
            <Icon name="Plus" />
            {t("addDrink")}
          </AddButton>}
        </HeaderActions> : null}
      </MenuHeader>

      {authenticated ? <DataDownload locale={locale} scope="menu" /> : null}

      <StickySearch>
        <SearchBar value={searchTerm} onChange={setSearchTerm} />
      </StickySearch>

      {archivedMode ? (
        <ArchivePanel>
          <h3>{locale === "ja" ? "アーカイブ済み商品" : "Archived Items"}</h3>
          <p>{locale === "ja"
            ? "ここから復元できます。アーカイブしても過去の売上・伝票は保持されます。"
            : "Restore previously archived items. Original ticket and sales history is never removed."}</p>
          {archivedLoading ? <p role="status">{t("loading")}</p> : null}
          {archivedError ? <p role="alert">{archivedError}</p> : null}
          {!archivedLoading && !archivedError && filteredArchived.length === 0
            ? <p>{locale === "ja" ? "該当するアーカイブ済み商品はありません。" : "No archived items found."}</p>
            : null}
          <ArchiveList>
            {filteredArchived.map(item => <li key={item.id}>
              <ArchiveItemInfo>
                <strong>{menuLabel(locale, item.name)}</strong>
                <small>{menuLabel(locale, item.category)}
                  {item.subcategory ? " · " + menuLabel(locale, item.subcategory) : ""}</small>
                <small>{Object.entries(item.prices ?? {}).map(([size,price]) =>
                  size + ": ¥" + Number(price).toLocaleString()).join(" · ")}</small>
              </ArchiveItemInfo>
              <button type="button" className="small hollow secondary"
                disabled={restoringId !== null || pendingMenuIds.includes(item.id)}
                onClick={() => void restoreItem(item)}>
                {restoringId === item.id ? (locale === "ja" ? "復元中…" : "Restoring…")
                  : (locale === "ja" ? "商品を復元" : "Restore Item")}
              </button>
            </li>)}
          </ArchiveList>
        </ArchivePanel>
      ) : <MenuGridContainer>
        {Object.entries(groupedMenu).map(([category, subcategories]) => (
          <MenuCategory
            key={category}
            category={category}
            subcategories={subcategories}
            onToggleStock={authenticated ? toggleStock : undefined}
            onSavePrices={authenticated ? savePrices : undefined}
            onSaveItem={authenticated ? onSaveItem : undefined}
            onArchive={authenticated ? archiveItem : undefined}
            pendingMenuIds={pendingMenuIds}
            categories={Array.from(new Set(menuItems.map(item => item.category)))}
            allSubcategories={Array.from(new Set(menuItems.map(item => item.subcategory).filter((value): value is string => Boolean(value))))}
          />
        ))}
      </MenuGridContainer>}
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


const HeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  align-items: center;
  button { width: auto; min-height: 44px; }
`;
const ArchivePanel = styled.section`
  margin-top: var(--space-3);
  max-width: 860px;
  p { color: var(--neutral-300); }
`;
const ArchiveList = styled.ul`
  list-style: none;
  padding: 0;
  li {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--neutral-700);
  }
  button { width: auto; min-height: 44px; }
`;
const ArchiveItemInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-0);
  min-width: 0;
  small { color: var(--neutral-400); }
`;
