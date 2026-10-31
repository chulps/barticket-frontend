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
          <span>15ml</span>
          <data>¥{p15.toLocaleString()}</data>
        </PriceRow>
      )}

      {p30 !== undefined && (
        <PriceRow>
          <span>30ml</span>
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
  min-width: 108px;
  gap: var(--space-1);
  flex-shrink: 0;
`;

const PriceText = styled.data`
  white-space: nowrap;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

const PriceRow = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  white-space: nowrap;
  span { color: var(--neutral-200); font-size: var(--font-size-small); text-transform: none; }
  data { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
`;