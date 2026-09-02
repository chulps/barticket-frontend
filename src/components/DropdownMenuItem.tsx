import styled from "styled-components";

type DropdownMenuItemProps = {
    children: React.ReactNode;
    onClick?: () => void;
    danger?: boolean;
    closeMenu?: () => void;
};

export default function DropdownMenuItem({
    children,
    onClick,
    danger = false,
    closeMenu,
}: DropdownMenuItemProps) {
    return (
        <Item
            onClick={() => {
                closeMenu?.();
                onClick?.();
            }}
            $danger={danger}
        >
            {children}
        </Item>
    );
}


const Item = styled.button<{ $danger: boolean }>`
    width: 100%;

    display: flex;
    align-items: center;

    padding: var(--space-1) var(--space-2);

    background: transparent;
    border: none;

    text-align: left;
    cursor: pointer;

    color: ${({ $danger }) =>
        $danger
            ? "var(--danger)"
            : "inherit"};

    border-radius: var(--space-1);

    &:hover {
        background: var(--neutral-800);
    }

    &:first-of-type {
        padding-top: var(--space-2);
    }

    &:last-of-type {
        padding-bottom: var(--space-2);
    }
`;