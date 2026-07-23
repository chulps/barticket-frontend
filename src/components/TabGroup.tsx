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
  return (
    <Container>
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
  );
}

const Container = styled.div`
  display: flex;
  gap: var(--space-0);
  padding: var(--space-0);
  border: 1px solid var(--neutral-700);
  border-radius: var(--space-1);
`;

const TabButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: var(--space-1);

  border: none;
  border-radius: calc(var(--space-1) - 2px);

  background: ${({ $active }) =>
    $active ? "var(--neutral-800)" : "transparent"};

  color: ${({ $active }) =>
    $active ? "white" : "var(--neutral-400)"};

  transition: 0.2s ease;

  &:hover {
    background: var(--neutral-800);
    color: white;
  }
`;