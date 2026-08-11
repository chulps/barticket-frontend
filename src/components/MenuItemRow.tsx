import styled from "styled-components";

import MenuPrice from "./MenuPrice";

import type { MenuItem } from "../types/Menu";

type MenuItemRowProps = {
    item: MenuItem;
};

export default function MenuItemRow({
    item,
}: MenuItemRowProps) {
    return (
        <MenuRow
            style={{
                opacity:
                    item.category === "Cocktails" || item.inStock
                        ? 1
                        : 0.35,
            }}
        >
            <ItemInfo>
                <div>
                    <ItemName>{item.name}</ItemName>
                    {item.description && (
                        <Description>{item.description}</Description>
                    )}
                    {item.notes && (
                        <Note>*{item.notes}</Note>
                    )}
                </div>
                <Spacer />
                <MenuPrice item={item} />
            </ItemInfo>


        </MenuRow>
    );
}

const MenuRow = styled.div`
  gap: var(--space-0);
  margin-bottom: var(--space-1);
`;

const ItemInfo = styled.div`
  display: flex;
  align-items: end;
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