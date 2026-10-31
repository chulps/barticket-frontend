import styled from "styled-components";

import type { MenuItem, Prices } from "../types/Menu";
import type { MenuItemEdit } from "../api/menu";
import MenuItemRow from "./MenuItemRow"
import { menuLabel, useI18n } from "../i18n";


type MenuCategoryProps = {
  category: string;
  subcategories: Record<string, MenuItem[]>;
  onToggleStock?: (item: MenuItem) => void;
  onSavePrices?: (item: MenuItem, prices: Prices) => Promise<void>;
  onSaveItem?: (item: MenuItem, input: MenuItemEdit) => Promise<boolean>;
  onArchive?: (item: MenuItem) => Promise<boolean>;
  pendingMenuIds?: number[];
  categories?: string[];
  allSubcategories?: string[];
};

export default function MenuCategory({
  category,
  subcategories,
  onToggleStock,
  onSavePrices,
  onSaveItem,
  onArchive,
  pendingMenuIds = [],
  categories = [],
  allSubcategories = [],
}: MenuCategoryProps) {
  const { locale } = useI18n();
  return (
    <Category id={"menu-category-" + category} aria-labelledby={"menu-heading-" + category}>
      <CategoryHeading id={"menu-heading-" + category}>{menuLabel(locale, category)}</CategoryHeading>

      {Object.entries(subcategories).map(
        ([subcategory, items]) => (
          <div key={subcategory}>
            {subcategory !== "General" && (
              <SubHeading>{menuLabel(locale, subcategory)}</SubHeading>
            )}

            <MenuItemsContainer>
              {items.map((item) => (
                <MenuItemRow
                  key={item.id}
                  item={item}
                  onToggle={onToggleStock}
                  onSavePrices={onSavePrices}
                  onSaveItem={onSaveItem}
                  onArchive={onArchive}
                  pending={pendingMenuIds.includes(item.id)}
                  categories={categories}
                  subcategories={allSubcategories}
                />
              ))}
            </MenuItemsContainer>
          </div>
        )
      )}
    </Category>
  );
}

const MenuItemsContainer = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-2) var(--space-4);
  @media (min-width: 1000px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const Category = styled.section`
  min-width: 0;
  scroll-margin-top: 190px;
`;

const CategoryHeading = styled.h3`
  font-size: var(--font-size-h4);
  font-weight: 600;
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--neutral-600);
  overflow-wrap: anywhere;
`;

const SubHeading = styled.h4`
  font-size: var(--font-size-p);
  font-weight: 500;
  margin: var(--space-2) 0 var(--space-1);
  color: var(--neutral-200);
  overflow-wrap: anywhere;
`;
