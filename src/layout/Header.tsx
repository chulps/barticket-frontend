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
  const [userName, setUserName] = useState<string | null>(null);
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
          setUserName(null);
          setClockedIn(false);
        }
        return;
      }
      try {
        const me = await accountApi.me();
        const shift = await accountApi.currentShift();
        if (cancelled) return;
        setIsManager(me.role === "manager");
        setUserName(me.name.trim() || null);
        setClockedIn(
          Boolean(shift?.punches.some((punch) => punch.user_id === me.id && punch.clock_out === null)),
        );
      } catch {
        if (!cancelled) {
          setIsManager(false);
          setUserName(null);
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

      <Nav ref={navRef} $isOpen={isOpen} $authenticated={authenticated}>
        {authenticated ? <NavTabs>
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
              {userName ?? t("profile")}
            </>
          )}
        </NavLink>

        </NavTabs> : null}

      <LanguageToggle
        tabIndex={0}
        role="switch"
        aria-checked={locale === "ja"}
        aria-label={locale === "ja" ? "Language: Japanese. Switch to English" : "Language: English. Switch to Japanese"}
        title={locale === "ja" ? "日本語 → English" : "English → 日本語"}
        onClick={() => setLocale(locale === "ja" ? "en" : "ja")}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setLocale(locale === "ja" ? "en" : "ja");
          }
        }}
      >
        <LanguageLabel><Icon name="Translate" size="1.25em" /> <span>{locale === "ja" ? "言語" : "Language"}</span></LanguageLabel>
        <ToggleTrack $japanese={locale === "ja"} aria-hidden="true">
          <ToggleFlag>{locale === "ja" ? "🇯🇵" : "🇺🇸"}</ToggleFlag>
          <ToggleThumb />
        </ToggleTrack>
      </LanguageToggle>
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

const Nav = styled.nav<{ $isOpen: boolean; $authenticated: boolean }>`
  display: flex;
  gap: var(--space-1);
  align-items: center;

  @media (max-width: 768px) {
    position: ${({ $authenticated }) => $authenticated ? "absolute" : "static"};
    top: var(--space-4);
    left: 0;

    background: ${({ $authenticated }) => $authenticated ? "var(--neutral-900)" : "transparent"};
    border: ${({ $authenticated }) => $authenticated ? "1px solid var(--neutral-700)" : "none"};
    border-radius: var(--space-2);

    align-items: stretch;
    flex-direction: column;
    overflow: hidden;
    transform-origin: top;
    transform: ${({ $isOpen, $authenticated }) =>
    !$authenticated || $isOpen ? "scaleY(1)" : "scaleY(0)"};

    opacity: ${({ $isOpen, $authenticated }) => (!$authenticated || $isOpen ? 1 : 0)};

    transition:
      transform 0.3s ease,
      opacity 0.2s ease;

    pointer-events: ${({ $isOpen, $authenticated }) =>
    !$authenticated || $isOpen ? "auto" : "none"};
  }
`;

const NavTabs = styled.div`
  display: flex;
  align-items: stretch;
  gap: 0;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const LanguageToggle = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--neutral-300);
  cursor: pointer;
  padding: var(--space-2);

  &:hover { color: white; }
  &:focus-visible { outline: 2px solid white; outline-offset: -2px; }

  @media (max-width: 768px) {
    width: 100%;
    box-sizing: border-box;
    justify-content: space-between;
    border-top: 1px solid var(--neutral-700);
  }
`;

const LanguageLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: var(--space-0);
`;

const ToggleTrack = styled.span<{ $japanese: boolean }>`
  display: flex;
  align-items: center;
  flex-direction: ${({ $japanese }) => $japanese ? "row" : "row-reverse"};
  justify-content: space-between;
  gap: 3px;
  padding: 3px;
  min-width: 64px;
  height: 32px;
  border-radius: 999px;
  background: var(--neutral-800);
  border: 1px solid var(--neutral-700);
  box-sizing: border-box;
`;

const ToggleFlag = styled.span`
  font-size: 19px;
  line-height: 1;
`;

const ToggleThumb = styled.span`
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: white;
  flex-shrink: 0;
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

  }
`;