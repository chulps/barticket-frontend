import styled from "styled-components";

import type { MenuItem, Prices } from "../types/Menu";
import MenuItemRow from "./MenuItemRow"
import { menuLabel, useI18n } from "../i18n";


type MenuCategoryProps = {
  category: string;
  subcategories: Record<string, MenuItem[]>;
  onToggleStock?: (item: MenuItem) => void;
  onSavePrices?: (item: MenuItem, prices: Prices) => Promise<void>;
  pendingMenuIds?: number[];
  categories?: string[];
  allSubcategories?: string[];
};

export default function MenuCategory({
  category,
  subcategories,
  onToggleStock,
  onSavePrices,
  pendingMenuIds = [],
  categories = [],
  allSubcategories = [],
}: MenuCategoryProps) {
  const { locale } = useI18n();
  return (
    <Category>
      <CategoryHeading>{menuLabel(locale, category)}</CategoryHeading>

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
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
`;

const Category = styled.section`
  break-inside: avoid;
  margin-bottom: var(--space-4);
`;

const CategoryHeading = styled.h3`
  margin-bottom: var(--space-2);
  padding-bottom: 0.35rem;
  border-bottom: 2px solid var(--accent);
`;

const SubHeading = styled.label`
  margin: var(--space-2) 0 var(--space-1);
  color: var(--neutral-300);
  align-self: center;
`;
