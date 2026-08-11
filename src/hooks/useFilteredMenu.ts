import { useMemo } from "react";

import type { MenuData, MenuItem } from "../types/Menu";

type GroupedMenu = Record<
  string,
  Record<string, MenuItem[]>
>;

export function useFilteredMenu(
  menu: MenuData | null,
  searchTerm: string
): GroupedMenu {
  const filteredItems = useMemo(() => {
    if (!menu) return [];

    const search = searchTerm
      .replace(/[¥,]/g, "")
      .toLowerCase()
      .trim();

    if (!search) {
      return menu.items;
    }

    return menu.items.filter((item) => {
      const textFields = [
        item.name,
        item.category,
        item.subcategory,
        item.description,
        item.notes,
        ...(item.tags ?? []),
      ];

      const textMatch = textFields
        .filter(Boolean)
        .some((field) =>
          field!.toLowerCase().includes(search)
        );

      const priceFields = [
        item.prices?.standard,
        item.prices?.["15ml"],
        item.prices?.["30ml"],
      ];

      const priceMatch = priceFields.some(
        (price) => price?.toString() === search
      );

      return textMatch || priceMatch;
    });
  }, [menu, searchTerm]);

  return useMemo(() => {
    if (!menu) return {};

    return filteredItems.reduce<GroupedMenu>((acc, item) => {
      const category = item.category;
      const subcategory = item.subcategory ?? "General";

      if (!acc[category]) {
        acc[category] = {};
      }

      if (!acc[category][subcategory]) {
        acc[category][subcategory] = [];
      }

      acc[category][subcategory].push(item);

      return acc;
    }, {});
  }, [filteredItems, menu]);
}