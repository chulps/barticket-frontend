import styled from "styled-components";

import type { MenuItem } from "../types/Menu";

type MenuPriceProps = {
  item: MenuItem;
};

export default function MenuPrice({
  item,
}: MenuPriceProps) {
  const {
    standard,
    ["15ml"]: p15,
    ["30ml"]: p30,
  } = item.prices ?? {};

  if (standard !== undefined) {
    return (
      <PriceText>
        ¥{standard.toLocaleString()}
      </PriceText>
    );
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
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  white-space: nowrap;
`;