import { useState } from "react";
import styled from "styled-components";

// imported components
import SearchBar from "../components/MenuSearchBar";
import MenuCategory from "../components/MenuCategory";

// import Menu data types
import type { MenuData } from "../types/Menu";

import { useFilteredMenu } from "../hooks/useFilteredMenu";
import { useI18n } from "../i18n";


type MenuProps = {
  menu: MenuData | null;
  loadingMenu: boolean;
};

export default function Menu({
  menu,
  loadingMenu,
}: MenuProps) {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");

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