import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";

type DropdownMenuProps = {
    trigger: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
    children: (closeMenu: () => void) => React.ReactNode;
};

export default function DropdownMenu({
    trigger,
    children,
}: DropdownMenuProps) {

    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const closeMenu = () => setIsOpen(false);


    // Close when clicking outside
    useEffect(() => {

        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                closeMenu();
            }
        };

        document.addEventListener(
            "mousedown",
            handleClickOutside
        );

        return () => {
            document.removeEventListener(
                "mousedown",
                handleClickOutside
            );
        };

    }, []);


    return (
        <Container ref={containerRef}>

            <Trigger
                onClick={() => setIsOpen((prev) => !prev)}
            >
                {
                    typeof trigger === "function"
                        ? trigger(isOpen)
                        : trigger
                }
            </Trigger>

            <Menu $isOpen={isOpen}>
                {children(closeMenu)}
            </Menu>

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
    cursor: pointer;

    &:hover {
        background: transparent;
    }
`;


const Menu = styled.div<{ $isOpen: boolean }>`
    position: absolute;
    right: 0;
    top: calc(100% + var(--space-1));

    min-width: 160px;

    background: var(--neutral-900);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-1);

    transform-origin: top right;

    transform: ${({ $isOpen }) =>
        $isOpen
            ? "scale(1)"
            : "scale(0.95)"};

    opacity: ${({ $isOpen }) =>
        $isOpen ? 1 : 0};

    pointer-events: ${({ $isOpen }) =>
        $isOpen ? "auto" : "none"};

    transition:
        transform 0.15s ease,
        opacity 0.15s ease;

    z-index: 100;
`;