import styled from "styled-components";

type DropdownMenuItemProps = {
    children: React.ReactNode;
    onClick?: () => void;
    danger?: boolean;
    warning?: boolean;
    closeMenu?: () => void;
};

export default function DropdownMenuItem({
    children,
    onClick,
    danger = false,
    warning = false,
    closeMenu,
}: DropdownMenuItemProps) {
    return (
        <Item
            type="button"
            role="menuitem"
            onClick={() => {
                closeMenu?.();
                onClick?.();
            }}
            $danger={danger}
            $warning={warning}
        >
            {children}
        </Item>
    );
}


const Item = styled.button<{ $danger: boolean; $warning: boolean }>`
    && {
        width: 100%;
        min-width: max-content;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: var(--space-1);
        padding: var(--space-1) var(--space-2);
        padding-right: calc(var(--space-2) + var(--space-1));
        background: transparent;
        border: none;
        text-align: left;
        white-space: nowrap;
        cursor: pointer;
    }

    svg {
        flex: 0 0 auto;
        width: 1em;
        height: 1em;
    }

    color: ${({ $danger, $warning }) =>
        $danger
            ? "var(--danger)"
            : $warning
              ? "var(--warning)"
              : "inherit"};

    border-radius: var(--space-1);

    &:hover {
        background: var(--neutral-800);
        transform: none;
    }

    &:first-of-type {
        padding-top: var(--space-2);
    }

    &:last-of-type {
        padding-bottom: var(--space-2);
    }
`;