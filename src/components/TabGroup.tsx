import styled from "styled-components";

type Tab<T extends string> = {
  id: T;
  label: string;
};

type TabGroupProps<T extends string> = {
  tabs: Tab<T>[];
  activeTab: T;
  onChange: (id: T) => void;
};

export default function TabGroup<T extends string>({
  tabs,
  activeTab,
  onChange,
}: TabGroupProps<T>) {
const activeIndex = tabs.findIndex(tab => tab.id === activeTab);

return (
  <Container>
    <Indicator
      $index={activeIndex}
      $count={tabs.length}
    />

    {tabs.map((tab) => (
      <TabButton
        key={tab.id}
        $active={tab.id === activeTab}
        onClick={() => onChange(tab.id)}
      >
        {tab.label}
      </TabButton>
    ))}
  </Container>
);}

const Container = styled.div`
  position: relative;

  display: flex;
  gap: var(--space-0);
  padding: var(--space-0);

  border: 1px solid var(--neutral-700);
  border-radius: var(--space-1);

  overflow: hidden;
`;

const Indicator = styled.div<{
  $index: number;
  $count: number;
}>`
  position: absolute;
  top: var(--space-0);
  bottom: var(--space-0);
  left: var(--space-0);

  width: calc((100% - (var(--space-0) * 2)) / ${({ $count }) => $count});

  background: var(--neutral-800);
  border-radius: calc(var(--space-1) - 2px);

  transform: translateX(${({ $index }) => `${$index * 100}%`});
  transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 0;
  will-change: transform;
`;

const TabButton = styled.button<{ $active: boolean }>`
  position: relative;
  z-index: 1;

  flex: 1;
  padding: var(--space-1);

  border: none;
  border-radius: calc(var(--space-1) - 2px);

  background: transparent;

  color: ${({ $active }) =>
    $active ? "white" : "var(--neutral-400)"};

  transition: color 0.2s ease;

  &:hover {
    background: unset;
    color: white;
  }
`;