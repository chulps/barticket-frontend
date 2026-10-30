import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import styled from "styled-components";
import { nextSelectorIndex } from "./selectorNavigation";

type Tab<T extends string> = {
  id: T;
  label: string;
};

type TabGroupProps<T extends string> = {
  tabs: Tab<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  label?: string;
};

export default function TabGroup<T extends string>({
  tabs,
  activeTab,
  onChange,
  label,
}: TabGroupProps<T>) {
    const activeIndex = tabs.findIndex(tab => tab.id === activeTab);
    const viewport = useRef<HTMLDivElement>(null);
    const track = useRef<HTMLDivElement>(null);
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const [indicator, setIndicator] = useState({ left: 0, width: 0 });

    const measureActiveTab = useCallback(() => {
        const button = buttons.current[activeIndex];
        if (button) setIndicator({ left: button.offsetLeft, width: button.offsetWidth });
    }, [activeIndex]);

    useLayoutEffect(() => {
        measureActiveTab();
        const button = buttons.current[activeIndex];
        const scroller = viewport.current;
        if (!button || !scroller) return;

        // Keep keyboard and programmatic selection visible in the horizontal tab strip.
        const left = button.offsetLeft;
        const right = left + button.offsetWidth;
        if (left < scroller.scrollLeft) scroller.scrollTo({ left, behavior: "smooth" });
        else if (right > scroller.scrollLeft + scroller.clientWidth) {
            scroller.scrollTo({ left: right - scroller.clientWidth, behavior: "smooth" });
        }
    }, [activeIndex, measureActiveTab]);

    useLayoutEffect(() => {
        const resizeTarget = track.current;
        if (!resizeTarget || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measureActiveTab);
        observer.observe(resizeTarget);
        const activeButton = buttons.current[activeIndex];
        if (activeButton) observer.observe(activeButton);
        return () => observer.disconnect();
    }, [activeIndex, measureActiveTab]);

    function handleArrow(event: KeyboardEvent<HTMLButtonElement>, index: number) {
        const next = nextSelectorIndex(index, tabs.length, event.key);
        if (next === null) return;
        event.preventDefault();
        buttons.current[next]?.focus();
        onChange(tabs[next].id);
    }

    return (
        <Viewport ref={viewport} role="group" aria-label={label ?? tabs.map(tab => tab.label).join(" / ")}>
            <Track ref={track}>
                <Indicator $left={indicator.left} $width={indicator.width} />
                {tabs.map((tab, index) => (
                    <TabButton
                        key={tab.id}
                        ref={node => { buttons.current[index] = node; }}
                        type="button"
                        aria-pressed={tab.id === activeTab}
                        $active={tab.id === activeTab}
                        onClick={() => onChange(tab.id)}
                        onKeyDown={event => handleArrow(event, index)}
                    >
                        {tab.label}
                    </TabButton>
                ))}
            </Track>
        </Viewport>
    );
}

const Viewport = styled.div`
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid var(--neutral-700);
  border-radius: var(--space-1);
  scrollbar-width: none;

  &::-webkit-scrollbar { display: none; }
`;

const Track = styled.div`
  position: relative;
  display: flex;
  width: max-content;
  min-width: 100%;
  gap: var(--space-0);
  padding: var(--space-0);
  box-sizing: border-box;
`;

const Indicator = styled.div<{
  $left: number;
  $width: number;
}>`
  position: absolute;
  top: var(--space-0);
  bottom: var(--space-0);
  left: var(--space-0);
  width: ${({ $width }) => `${$width}px`};
  pointer-events: none;

  background: var(--neutral-800);
  border-radius: calc(var(--space-1) - 2px);

  transform: translateX(${({ $left }) => `${$left}px`});
  transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 0;
  will-change: transform;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const TabButton = styled.button<{ $active: boolean }>`
  position: relative;
  z-index: 1;

  flex: 1 0 max-content;
  min-height: 44px;
  padding: var(--space-1);
  white-space: nowrap;

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
