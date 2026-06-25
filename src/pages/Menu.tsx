import { useEffect, useState } from "react";
import styled from "styled-components";

type MenuItem = {
  id: number;
  name: string;
  price?: number;
  prices?: {
    "15ml": number;
    "30ml": number;
  };
};

type Subcategory = {
  id: number;
  name: string;
  items: MenuItem[];
};

type Category = {
  id: number;
  name: string;
  items?: MenuItem[];
  subcategories?: Subcategory[];
};

type MenuData = {
  menu_name: string;
  cover_charge: number;
  categories: Category[];
};

export default function Menu() {
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/menu")
      .then((res) => res.json())
      .then((data) => {
        setMenu(data[0]); // because backend returns an array
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <h1>Loading...</h1>;
  }

  if (!menu) {
    return <h1>No menu found.</h1>;
  }

  return (
    <main>
      <h1>{menu.menu_name}</h1>

      {menu.categories.map((category) => (
        <MenuCategory key={category.id}>
          <h2>{category.name}</h2>

          {category.items?.map((item) => (
            <div key={item.id}>
              <p>{item.name}</p>

              {item.price && <p>¥{item.price}</p>}

              {item.prices && (
                <div>
                  <p>15ml: ¥{item.prices["15ml"]}</p>
                  <p>30ml: ¥{item.prices["30ml"]}</p>
                </div>
              )}
            </div>
          ))}

          {category.subcategories?.map((subcategory) => (
            <MenuSubCategory key={subcategory.id}>
              <p>{subcategory.name}</p>

              {/* subcategories for japanese whiskey */}
              {subcategory.items.map((item) => (
                <div key={item.id}>
                  <p>{item.name}</p>

                  {item.price && <p>¥{item.price}</p>}

                  {item.prices && (
                    <div>
                      <p>15ml: ¥{item.prices["15ml"]}</p>
                      <p>30ml: ¥{item.prices["30ml"]}</p>
                    </div>
                  )}
                </div>
              ))}
            </MenuSubCategory>
          ))}
        </MenuCategory>
      ))}
    </main>
  );
}

const MenuCategory = styled.section`
  width: 100%;
  display: flex;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction:row-reverse;
    padding-left: 0;
  }
`;

const MenuSubCategory = styled.section`
background: red;

  // @media (max-width: 768px) {
  //   flex-direction:row-reverse;
  //   padding-left: 0;
  // }
`;