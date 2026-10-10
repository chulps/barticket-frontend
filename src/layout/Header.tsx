// src/components/Header.tsx

import { useEffect, useState } from "react";
import styled from "styled-components";
import Icon from "../components/Icon";
import FxxkupLogo from "../components/FxxkupLogo"
import { NavLink as RouterNavLink } from "react-router-dom"
import { accountApi } from "../api/account";
import { getToken } from "../api/client";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function loadRole() {
      if (!getToken()) {
        setIsManager(false);
        return;
      }
      accountApi
        .me()
        .then((me) => {
          if (!cancelled) setIsManager(me.role === "manager");
        })
        .catch(() => {
          if (!cancelled) setIsManager(false);
        });
    }
    loadRole();
    window.addEventListener("barticket-auth", loadRole);
    return () => {
      cancelled = true;
      window.removeEventListener("barticket-auth", loadRole);
    };
  }, []);

  return (
    <Navbar>
      <Logo>
        <FxxkupLogo />
      </Logo>

      <Hamburger
        className="hollow secondary"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Icon name={isOpen ? "X" : "List"} />
      </Hamburger>

      <Nav $isOpen={isOpen}>
        <NavLink
          onClick={() => setIsOpen(false)}
          to="/">
          {({ isActive }) => (
            <>
              <Icon
                name="House"
                weight={isActive ? "fill" : "regular"}
              />
              Dashboard
            </>
          )}
        </NavLink>

        <NavLink
          onClick={() => setIsOpen(false)}
          to="/menu">
          {({ isActive }) => (
            <>
              <Icon
                name="Book"
                weight={isActive ? "fill" : "regular"}
              />
              Drink Menu
            </>
          )}
        </NavLink>

        {isManager ? (
          <NavLink
            onClick={() => setIsOpen(false)}
            to="/analytics">
            {({ isActive }) => (
              <>
                <Icon
                  name="ChartDonut"
                  weight={isActive ? "fill" : "regular"}
                />
                Analytics
              </>
            )}
          </NavLink>
        ) : null}

        <NavLink
          onClick={() => setIsOpen(false)}
          to="/profile">
          {({ isActive }) => (
            <>
              <Icon
                name="UserCircle"
                weight={isActive ? "fill" : "regular"}
              />
              Profile
            </>
          )}
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
  padding: 0 0 var(--space-1) 0;
  border-bottom: 1px solid var(--secondary);
  z-index: 1;
  background: var(--neutral-950);
  flex-direction: row-reverse;

  @media (min-width: 768px) {
    padding: 0;
    flex-direction: row;
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
    top: var(--space-4);
    left: 0;

    background: var(--neutral-900);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-2);

    flex-direction: column;
    overflow: hidden;
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

const NavLink = styled(RouterNavLink)`
  position: relative;
  display: flex;
  align-items: center;

  color: var(--neutral-300);
  text-decoration: none;
  display: flex;
  gap: var(--space-0);
  padding: var(--space-2);

  &:hover {
    color: white;
  }

  &[aria-current="page"] {
    color: white;
  }

  &[aria-current="page"]::after {
    content: "";
    position: absolute;
    left: 0;
    bottom: 0;

    width: 100%;
    height: 1px;

    background: white;
  }

  @media (max-width: 768px) {
    padding: var(--space-1) var(--space-2);
    &[aria-current="page"] {
      background: var(--neutral-800);
    }

    &[aria-current="page"]::after {
      display: none;
    }

    &:first-of-type {
      padding-top: var(--space-2);
    }

    &:last-of-type {
      padding-bottom: var(--space-2);
    }
  }
`;