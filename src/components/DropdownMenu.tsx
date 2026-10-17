import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";

type DropdownMenuProps = {
    trigger: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
    /** Contextual name for the icon-only button (EN/JP supplied by caller). */
    label: string;
    children: (closeMenu: () => void) => React.ReactNode;
    disabled?: boolean;
};

export default function DropdownMenu({
    trigger, label, children, disabled = false,
}: DropdownMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [box, setBox] = useState<{ top: number; right: number } | null>(null);
    const menuId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const initialFocus = useRef<"first" | "last">("first");
    const skipFocusReturn = useRef(false);

    function closeMenu(restore = true) {
        skipFocusReturn.current = !restore;
        if (restore && menuRef.current?.contains(document.activeElement)) {
            triggerRef.current?.focus();
        }
        setIsOpen(false);
    }

    function toggle(focus: "first" | "last" = "first") {
        if (disabled) return;
        if (isOpen) { closeMenu(); return; }
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        initialFocus.current = focus;
        skipFocusReturn.current = false;
        setBox({
            top: Math.max(8, rect.bottom + 6),
            right: Math.max(8, window.innerWidth - rect.right),
        });
        setIsOpen(true);
    }

    useEffect(() => {
        if (!isOpen) return;
        const popup = menuRef.current;
        const trigger = triggerRef.current;
        if (!popup || !trigger) return;
        const options = popup.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])');
        const choice = initialFocus.current === "last" ? options[options.length - 1] : options[0];
        choice?.focus();

        // Measure the actual popup instead of guessing item height, and
        // position it above the trigger if the bottom of the viewport is tight.
        const triggerRect = trigger.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();
        const nextTop = triggerRect.bottom + 6 + popupRect.height > window.innerHeight - 8
            ? Math.max(8, triggerRect.top - popupRect.height - 6)
            : triggerRect.bottom + 6;
        const nextRight = Math.max(8, Math.min(window.innerWidth - triggerRect.right,
            Math.max(8, window.innerWidth - popupRect.width - 8)));
        setBox(previous => previous && previous.top === nextTop && previous.right === nextRight
            ? previous : { top: nextTop, right: nextRight });

        return () => {
            // If the row unmounts while keyboard focus remains in its portal,
            // restore focus to the trigger when it still exists.
            if (!skipFocusReturn.current && popup.contains(document.activeElement) && trigger.isConnected) trigger.focus();
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (containerRef.current?.contains(target)) return;
            if (menuRef.current?.contains(target)) return;
            closeMenu(false);
        };
        const handleScrollOrResize = () => closeMenu();
        document.addEventListener("mousedown", handleClickOutside);
        window.addEventListener("scroll", handleScrollOrResize, true);
        window.addEventListener("resize", handleScrollOrResize);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            window.removeEventListener("scroll", handleScrollOrResize, true);
            window.removeEventListener("resize", handleScrollOrResize);
        };
    }, [isOpen]);

    function handleMenuKeys(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
            return;
        }
        if (event.key === "Tab") {
            closeMenu(false);
            return;
        }
        const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>(
            'button[role="menuitem"]:not([disabled])',
        ) ?? []);
        if (!nodes.length) return;
        const currentIndex = nodes.indexOf(document.activeElement as HTMLButtonElement);
        let nextIndex: number;
        if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % nodes.length;
        else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + nodes.length) % nodes.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = nodes.length - 1;
        else return;
        event.preventDefault();
        nodes[nextIndex].focus();
    }

    return (
        <Container ref={containerRef}>
            <Trigger
                ref={triggerRef}
                type="button"
                disabled={disabled}
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={isOpen ? menuId : undefined}
                onClick={() => toggle()}
                onKeyDown={event => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        toggle(event.key === "ArrowUp" ? "last" : "first");
                    }
                }}
            >
                {typeof trigger === "function" ? trigger(isOpen) : trigger}
            </Trigger>
            {isOpen && box
                ? createPortal(
                    <Menu id={menuId} ref={menuRef} role="menu" aria-label={label}
                        $top={box.top} $right={box.right} onKeyDown={handleMenuKeys}>
                        {children(() => closeMenu())}
                    </Menu>,
                    document.body,
                )
                : null}
        </Container>
    );
}

const Container = styled.div`
    position: relative;
`;
const Trigger = styled.button`
    background: transparent;
    border: none;
    padding: var(--space-1);
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: inherit;
    cursor: pointer;
    &:hover { background: transparent; transform: none; }
    &:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
`;
const Menu = styled.div<{ $top: number; $right: number }>`
    position: fixed;
    top: ({ $top }) => $toppx;
    right: ({ $right }) => $rightpx;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: fit-content;
    max-width: calc(100vw - var(--space-3));
    max-height: calc(100dvh - 16px);
    overflow-y: auto;
    background: var(--neutral-900);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-1);
    z-index: 1200;
    color: var(--white);
`;
