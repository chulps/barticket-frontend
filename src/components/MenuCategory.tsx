import styled from "styled-components";

import type { MenuItem, Prices } from "../types/Menu";
import MenuItemRow from "./MenuItemRow"
import { menuLabel, useI18n } from "../i18n";


type MenuCategoryProps = {
  category: string;
  subcategories: Record<string, MenuItem[]>;
  onToggleStock?: (item: MenuItem) => void;
  onSavePrices?: (item: MenuItem, prices: Prices) => Promise<void>;
};

export default function MenuCategory({
  category,
  subcategories,
  onToggleStock,
  onSavePrices,
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
