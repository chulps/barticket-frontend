import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";

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
          <span>15ml</span>
          <span>¥{p15.toLocaleString()}</span>
        </PriceRow>
      )}

      {p30 !== undefined && (
        <PriceRow>
          <span>30ml</span>
          <span>¥{p30.toLocaleString()}</span>
        </PriceRow>
      )}
    </PriceContainer>
  );
}
export default function Menu() {
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);

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

  const groupedMenu = useMemo<GroupedMenu>(() => {
    if (!menu) return {};

    return menu.items.reduce<GroupedMenu>((acc, item) => {
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
  }, [menu]);

  if (loading) {
    return <h1>Loading...</h1>;
  }

  if (!menu) {
    return <h1>No menu found.</h1>;
  }

return (
  <main>
    <MenuHeader>Drink Menu</MenuHeader>

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
                    opacity: item.inStock ? 1 : 0.35,
                  }}
                >
                  <ItemInfo>
                    <ItemName>{item.name}</ItemName>

                    {item.description && (
                      <Description>{item.description}</Description>
                    )}

                    {item.notes && (
                      <Note>{item.notes}</Note>
                    )}
                  </ItemInfo>

                  <Spacer />

                  <Price item={item} />
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

const SubHeading = styled.h3`
  margin: var(--space-2) 0 var(--space-1);
  color: var(--neutral-300);
`;

const MenuRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
`;

const ItemInfo = styled.div`
  flex-shrink: 0;
  max-width: 28ch;
`;

const ItemName = styled.p`
  font-weight: 500;
`;

const Description = styled.p`
  margin-top: 0.15rem;
  font-size: 0.8rem;
  line-height: 1.3;
  color: var(--neutral-400);
`;

const Note = styled.span`
  margin-left: 0.4rem;
  color: var(--accent);
  font-size: 0.8rem;
`;

const Spacer = styled.div`
  flex: 1;
  align-self: center;
  border-bottom: 1px dashed var(--neutral-700);
`;

const PriceContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 90px;
`;

const PriceText = styled.p`
  white-space: nowrap;
  font-weight: 500;
`;

const PriceRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  white-space: nowrap;
  font-size: 0.9rem;
`;