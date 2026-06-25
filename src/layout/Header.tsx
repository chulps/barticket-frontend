// src/components/Header.tsx

import { useState } from "react";
import styled from "styled-components";
import Icon from "../components/Icon"

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Navbar>
        <Logo>Rock Bar Fxxkup</Logo>

        <Hamburger onClick={() => setIsOpen(!isOpen)}>
          <Icon name="List" />
        </Hamburger>

        <Nav $isOpen={isOpen}>
          <NavLink href="#menu">Menu</NavLink>
          <NavLink href="#whiskey">Whiskey</NavLink>
          <NavLink href="#cocktails">Cocktails</NavLink>
          <NavLink href="#contact">Contact</NavLink>
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
  padding: 0 1rem 1rem;
  border-bottom: 1px solid var(--secondary);
  z-index: 1000;

    @media (max-width: 768px) {
    flex-direction:row-reverse;
    padding-left: 0;
  }
`;

const Logo = styled.h1`
  color: white;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 1px;
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
  gap: 2rem;

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

const NavLink = styled.a`
  color: white;
  text-decoration: none;
  font-size: 1rem;
  transition: 0.2s;

  &:hover {
    color: #ff4747;
  }
`;