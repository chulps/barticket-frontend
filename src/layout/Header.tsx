// src/components/Header.tsx

import { useState } from "react";
import styled from "styled-components";
import Icon from "../components/Icon";
import FxxkupLogo from "../components/FxxkupLogo"
import { Link as RouterLink} from "react-router-dom"

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Navbar>
      <Logo>
        <FxxkupLogo />
      </Logo>

      <Hamburger onClick={() => setIsOpen(!isOpen)}>
        <Icon name="List" />
      </Hamburger>

      <Nav $isOpen={isOpen}>
        <NavLink to="/">
          <Icon
            color="var(--neutral-300)"
            hoverColor="white"
            name="House"
          />
          Home
        </NavLink>

        <NavLink to="/menu">
          Menu
        </NavLink>

        <NavLink to="/tickets">
          Tickets
        </NavLink>

        <NavLink to="/payments">
          Payments
        </NavLink>
      </Nav>
    </Navbar>
  );
}

const Navbar = styled.header`
  width: 100%;
  position: sticky;
  top: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--secondary);
  z-index: 1000;
  background: var(--neutral-950);

    @media (max-width: 768px) {
    flex-direction:row-reverse;
    padding-left: 0;
  }
`;

const Logo = styled.h1`
  color: white;
`;

const Hamburger = styled.button`
  display: none;
  flex-direction: column;
  gap: 5px;

  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1);
  border-radius: var(--space-1);
  border: 1px solid var(--neutral-700);

  @media (max-width: 768px) {
    display: flex;
  }
`;

const Nav = styled.nav<{ $isOpen: boolean }>`
  display: flex;
  gap: 0;

  @media (max-width: 768px) {
    position: absolute;
    top: 70px;
    left: 0;

    width: 100%;
    background: var(--neutral-900);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-2);

    flex-direction: column;
    padding: 1.5rem 2rem;

    /* animation stuff */
    transform-origin: top;
    transform: ${({ $isOpen }) =>
    $isOpen ? "scaleY(1)" : "scaleY(0)"};

    opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};

    transition:
      transform 0.3s ease,
      opacity 0.2s ease;

    pointer-events: ${({ $isOpen }) =>
    $isOpen ? "auto" : "none"};
  }
`;

const NavLink = styled(RouterLink)`
  color: var(--neutral-300);
  text-decoration: none;
  display: flex;
  gap: var(--space-0);
  padding: var(--space-1);

  &:hover {
    color: white;
    transform: scale(1.05);
    transform-origin: center;
  }
`;