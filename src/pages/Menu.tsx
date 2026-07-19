import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";

// imported components
import SearchBar from "../components/MenuSearchBar";

type Prices = {
  standard?: number;
  "15ml"?: number;
  "30ml"?: number;
};

type MenuItem = {
  id: number;
  inStock: boolean;

  category: string;
  subcategory?: string;

  name: string;
  description?: string;
  notes?: string;

  prices: Prices;

  cocktail?: boolean;
};

type MenuData = {
  coverCharge: number;
  items: MenuItem[];
};

type GroupedMenu = Record<
  string,
  Record<string, MenuItem[]>
>;

function Price({ item }: { item: MenuItem }) {
  const { standard, ["15ml"]: p15, ["30ml"]: p30 } = item.prices ?? {};

  if (standard !== undefined) {
    return <PriceText>¥{standard.toLocaleString()}</PriceText>;
  }

  return (
    <PriceContainer>
      {p15 !== undefined && (
        <PriceRow>
          <label>15ml</label>
          <data>¥{p15.toLocaleString()}</data>
        </PriceRow>
      )}

      {p30 !== undefined && (
        <PriceRow>
          <label>30ml</label>
          <data>¥{p30.toLocaleString()}</data>
        </PriceRow>
      )}
    </PriceContainer>
  );
}
export default function Menu() {
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/menu")
      .then((res) => res.json())
      .then((data) => {
        // backend currently returns an array
        setMenu(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
  if (!menu) return [];

  const search = searchTerm.toLowerCase().trim();

  if (!search) {
    return menu.items;
  }

  return menu.items.filter((item) =>
    [
      item.name,
      item.category,
      item.subcategory,
      item.description,
      item.notes,
    ]
      .filter(Boolean)
      .some((field) =>
        field!.toLowerCase().includes(search)
      )
  );
}, [menu, searchTerm]);

  const groupedMenu = useMemo<GroupedMenu>(() => {
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

  if (loading) {
    return <h1>Loading...</h1>;
  }

  if (!menu) {
    return <h1>No menu found.</h1>;
  }

  return (
    <main>
      <MenuHeader>Drink Menu</MenuHeader>
      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
      />

      <MenuGridContainer>
        {Object.entries(groupedMenu).map(([categoryName, subcategories]) => (
          <Category key={categoryName}>
            <CategoryHeading>{categoryName}</CategoryHeading>

            {Object.entries(subcategories).map(([subcategoryName, items]) => (
              <div key={subcategoryName}>
                {subcategoryName !== "General" && (
                  <SubHeading>{subcategoryName}</SubHeading>
                )}

                {items.map((item) => (
                  <MenuRow
                    key={item.id}
                    style={{
                      opacity:
                        item.category === "Cocktails" || item.inStock
                          ? 1
                          : 0.35,
                    }}
                  >
                    <ItemInfo>
                      <ItemName>{item.name}</ItemName>
                      <Spacer />
                      <Price item={item} />
                    </ItemInfo>
                    {item.description && (
                      <Description>{item.description}</Description>
                    )}

                    {item.notes && (
                      <Note>*{item.notes}</Note>
                    )}

                  </MenuRow>
                ))}
              </div>
            ))}
          </Category>
        ))}
      </MenuGridContainer>
    </main>
  );
}


const MenuHeader = styled.h1`
  padding-top: var(--space-2);
  margin-bottom: var(--space-3);
`;

const MenuGridContainer = styled.section`
  columns: 320px;
  column-gap: var(--space-4);
`;

const Category = styled.section`
  break-inside: avoid;
  margin-bottom: var(--space-4);
`;

const CategoryHeading = styled.h2`
  margin-bottom: var(--space-2);
  padding-bottom: 0.35rem;
  border-bottom: 2px solid var(--accent);
`;

const SubHeading = styled.label`
  margin: var(--space-2) 0 var(--space-1);
  color: var(--neutral-300);
`;

const MenuRow = styled.div`
  gap: var(--space-0);
  margin-bottom: var(--space-1);
`;

const ItemInfo = styled.div`
  display: flex;
  align-items: start;
  gap: var(--space-1);
`;

const ItemName = styled.p`
  font-weight: 300;
`;

const Description = styled.small`
  margin-top: 0.15rem;
  line-height: 1.3;
  color: var(--neutral-400);
`;

const Note = styled.small`
  margin-left: 0.4rem;
  color: var(--accent);
`;

const Spacer = styled.div`
  flex: 1;
  align-self: flex-end;
  border-bottom: 1px dashed var(--neutral-700);
`;

const PriceContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 90px;
`;

const PriceText = styled.data`
  white-space: nowrap;
`;

const PriceRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  white-space: nowrap;
`;