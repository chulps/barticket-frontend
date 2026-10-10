import { useEffect, useState } from "react";
import styled from "styled-components";

// imported components
import SearchBar from "../components/MenuSearchBar";
import MenuCategory from "../components/MenuCategory";

// import Menu data types
import type { MenuData, MenuItem } from "../types/Menu";

import { useFilteredMenu } from "../hooks/useFilteredMenu";
import { useI18n } from "../i18n";
import { setMenuStock } from "../api/menu";
import { ApiError, getToken } from "../api/client";


type MenuProps = {
  menu: MenuData | null;
  loadingMenu: boolean;
  onStockChange: (itemId: number, inStock: boolean) => void;
};

export default function Menu({
  menu,
  loadingMenu,
  onStockChange,
}: MenuProps) {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()));

  useEffect(() => {
    const sync = () => setSignedIn(Boolean(getToken()));
    window.addEventListener("barticket-auth", sync);
    return () => window.removeEventListener("barticket-auth", sync);
  }, []);

  async function toggleStock(item: MenuItem) {
    try {
      const updated = await setMenuStock(item.id, item.inStock === false);
      onStockChange(item.id, updated.inStock !== false);
    } catch (error) {
      window.alert(error instanceof ApiError ? error.message : t("stockUpdateFailed"));
    }
  }

  const groupedMenu = useFilteredMenu(menu, searchTerm);

  if (loadingMenu) {
    return <h1>{t("loading")}</h1>;
  }

  if (!menu) {
    return <h1>{t("noMenu")}</h1>;
  }

  return (
    <main>
      <MenuHeader>{t("drinkMenu")}</MenuHeader>

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
            onToggleStock={signedIn ? toggleStock : undefined}
          />
        ))}
      </MenuGridContainer>
    </main>
  );
}


const MenuHeader = styled.h2`
  padding-top: var(--space-2);
  margin-bottom: var(--space-3);
`;

const MenuGridContainer = styled.section`
  columns: 100%;
  margin-top: var(--space-3);
    column-gap: var(--space-4);

  @media (min-width: 768px) {
    columns: var(--space-6);
  }
  `