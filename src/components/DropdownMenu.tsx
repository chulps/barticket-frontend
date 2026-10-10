import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";

type DropdownMenuProps = {
    trigger: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
    children: (closeMenu: () => void) => React.ReactNode;
    disabled?: boolean;
};

export default function DropdownMenu({
    trigger,
    children,
    disabled = false,
}: DropdownMenuProps) {

    const [isOpen, setIsOpen] = useState(false);
    const [box, setBox] = useState<{ top: number; right: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const closeMenu = () => setIsOpen(false);

    function toggle() {
        if (disabled) return;
        if (isOpen) {
            closeMenu();
            return;
        }
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setBox({
            top: rect.bottom + 6,
            right: window.innerWidth - rect.right,
        });
        setIsOpen(true);
    }

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (containerRef.current?.contains(target)) return;
            if (menuRef.current?.contains(target)) return;
            closeMenu();
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const close = () => setIsOpen(false);
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);
        return () => {
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("resize", close);
        };
    }, [isOpen]);


    return (
        <Container ref={containerRef}>

            <Trigger
                type="button"
                disabled={disabled}
                onClick={toggle}
            >
                {typeof trigger === "function"
                    ? trigger(isOpen)
                    : trigger}
            </Trigger>

            {isOpen && box
                ? createPortal(
                    <Menu ref={menuRef} $top={box.top} $right={box.right}>
                        {children(closeMenu)}
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
    padding: 0;
    min-width: unset;
    color: inherit;
    cursor: pointer;

    &:hover {
        background: transparent;
        transform: none;
    }
`;


const Menu = styled.div<{ $top: number; $right: number }>`
    position: fixed;
    top: ${({ $top }) => $top}px;
    right: ${({ $right }) => $right}px;

    width: max-content;
    min-width: 160px;
    max-width: min(18rem, calc(100vw - var(--space-3)));

    background: var(--neutral-900);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-1);

    z-index: 1200;
    color: var(--white);
`;