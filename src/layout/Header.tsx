// src/components/Header.tsx

import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import Icon from "../components/Icon";
import FxxkupLogo from "../components/FxxkupLogo"
import { NavLink as RouterNavLink } from "react-router-dom"
import { accountApi } from "../api/account";
import { getToken } from "../api/client";
import { listNotices } from "../api/notices";
import { useI18n } from "../i18n";

export default function Header({ authenticated }: { authenticated: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isManager, setIsManager] = useState(false);
  const [clockedIn, setClockedIn] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const { t, locale, setLocale } = useI18n();
  const canSeeNotices = isManager || clockedIn;

  useEffect(() => {
    let cancelled = false;
    async function loadRole() {
      if (!getToken()) {
        if (!cancelled) {
          setIsManager(false);
          setClockedIn(false);
        }
        return;
      }
      try {
        const me = await accountApi.me();
        const shift = await accountApi.currentShift();
        if (cancelled) return;
        setIsManager(me.role === "manager");
        setClockedIn(
          Boolean(shift?.punches.some((punch) => punch.user_id === me.id && punch.clock_out === null)),
        );
      } catch {
        if (!cancelled) {
          setIsManager(false);
          setClockedIn(false);
        }
      }
    }
    loadRole();
    const timer = window.setInterval(loadRole, 20000);
    window.addEventListener("barticket-auth", loadRole);
    window.addEventListener("focus", loadRole);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("barticket-auth", loadRole);
      window.removeEventListener("focus", loadRole);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (navRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!canSeeNotices) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await listNotices();
        if (!cancelled) setAlertCount(data.notices.length);
      } catch {
        if (!cancelled) setAlertCount(0);
      }
    }
    load();
    const timer = window.setInterval(load, 20000);
    window.addEventListener("barticket-notices", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("barticket-notices", load);
    };
  }, [canSeeNotices]);

  return (
    <Navbar>
      <Logo>
        <FxxkupLogo />
      </Logo>

      {authenticated ? <Hamburger
        ref={menuButtonRef}
        className="hollow secondary"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Icon name={isOpen ? "X" : "List"} />
        {alertCount > 0 ? <MenuBadge>{alertCount}</MenuBadge> : null}
      </Hamburger> : null}

      {authenticated ? <Nav ref={navRef} $isOpen={isOpen}>
        <NavLink
          onClick={() => setIsOpen(false)}
          to="/tickets">
          {({ isActive }) => (
            <>
              <Icon
                name="ListDashes"
                weight={isActive ? "fill" : "regular"}
              />
              {t("tickets")}
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
              {t("drinkMenu")}
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
                {t("analytics")}
              </>
            )}
          </NavLink>
        ) : null}

        {canSeeNotices ? (
          <NavLink
            onClick={() => setIsOpen(false)}
            to="/notifications">
            {({ isActive }) => (
              <>
                <Icon
                  name="Bell"
                  weight={isActive ? "fill" : "regular"}
                />
                {t("notifications")}
                {alertCount > 0 ? <AlertCount>{alertCount}</AlertCount> : null}
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
              {t("profile")}
            </>
          )}
        </NavLink>

      </Nav> : (
        <LanguageButton type="button" onClick={() => setLocale(locale === "ja" ? "en" : "ja")}>
          {locale === "ja" ? "English" : "日本語"}
        </LanguageButton>
      )}
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
  z-index: 100;
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
  position: relative;
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

const MenuBadge = styled.span`
  position: absolute;
  top: 0;
  right: 0;
  transform: translate(35%, -35%);
  min-width: 1.4em;
  height: 1.4em;
  padding: 0 0.3em;
  border-radius: 999px;
  background: var(--danger-500);
  color: white;
  font-size: 10px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
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

const LanguageButton = styled.button`
  background: none;
  border: none;
  color: var(--neutral-300);
  cursor: pointer;
  padding: var(--space-2);
  text-align: left;

  &:hover {
    color: white;
  }
`;

const AlertCount = styled.span`
  color: var(--danger-400);
  font-size: 12px;
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