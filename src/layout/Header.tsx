import { shouldPoll } from "../api/realtime";
// src/components/Header.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import Icon from "../components/Icon";
import FxxkupLogo from "../components/FxxkupLogo"
import { NavLink as RouterNavLink } from "react-router-dom"
import { accountApi } from "../api/account";
import type { ShiftReport } from "../api/account";
import { getToken } from "../api/client";
import { listNotices } from "../api/notices";
import { useI18n } from "../i18n";
import { useModal } from "../hooks/useModal";
import ShiftCloseReview from "../pages/ShiftCloseReview";
import { businessDateJst, shouldPromptNoonReview } from "../pages/shiftControlPolicy";

export default function Header({ authenticated }: { authenticated: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isManager, setIsManager] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [shiftForNoonReview, setShiftForNoonReview] = useState<ShiftReport | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clockedIn, setClockedIn] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const promptedNoonShifts = useRef(new Set<string>());
  const { t, locale, setLocale } = useI18n();
  const { modal, openModal } = useModal();
  const canSeeNotices = isManager || clockedIn;

  const closeMainNavigation = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus && window.matchMedia("(max-width: 768px)").matches) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    let activeToken: string | null = null;
    async function loadRole() {
      const request = ++generation;
      const token = getToken();
      if (!token || token !== activeToken) {
        activeToken = token;
        if (!cancelled) {
          setIsManager(false);
          setUserName(null);
          setUserId(null);
          setShiftForNoonReview(null);
          setClockedIn(false);
          setAlertCount(0);
          setIsOpen(false);
          setMoreOpen(false);
        }
        if (!token) return;
      }
      try {
        const [me, shift] = await Promise.all([accountApi.me(), accountApi.currentShift()]);
        if (cancelled || request !== generation || getToken() !== token) return;
        setIsManager(me.role === "manager");
        setUserName(me.name.trim() || null);
        setUserId(me.id);
        setShiftForNoonReview(shift);
        setClockedIn(
          Boolean(shift?.punches.some((punch) => punch.user_id === me.id && punch.clock_out === null)),
        );
      } catch {
        if (!cancelled && request === generation && getToken() === token) {
          setIsManager(false);
          setUserName(null);
          setUserId(null);
          setShiftForNoonReview(null);
          setClockedIn(false);
          setAlertCount(0);
        }
      }
    }
    const resetRole = () => { activeToken = null; void loadRole(); };
    void loadRole();
    const timer = window.setInterval(() => { if (shouldPoll()) void loadRole(); }, 20000);
    window.addEventListener("barticket-auth", resetRole);
    window.addEventListener("barticket-shift-updated", loadRole);
    window.addEventListener("focus", loadRole);
    window.addEventListener("barticket-users-updated", loadRole);
    return () => {
      cancelled = true;
      generation++;
      window.clearInterval(timer);
      window.removeEventListener("barticket-auth", resetRole);
      window.removeEventListener("barticket-shift-updated", loadRole);
      window.removeEventListener("focus", loadRole);
      window.removeEventListener("barticket-users-updated", loadRole);
    };
  }, []);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const timer = window.setInterval(tick, 10000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  useEffect(() => {
    if (!isManager || userId === null || !shiftForNoonReview || shiftForNoonReview.status !== "open") return;
    const businessDate = businessDateJst(nowMs);
    if (shiftForNoonReview.business_date !== businessDate || !shouldPromptNoonReview(nowMs, shiftForNoonReview.business_date)) return;
    const promptKey = `barticket:noon-review:${userId}:${shiftForNoonReview.business_date}`;
    if (modal || promptedNoonShifts.current.has(promptKey)) return;
    try {
      if (window.localStorage.getItem(promptKey)) return;
      window.localStorage.setItem(promptKey, "shown");
    } catch { /* A mounted-session ref below is unnecessary once the modal opens. */ }
    promptedNoonShifts.current.add(promptKey);
    const shiftId = shiftForNoonReview.id;
    openModal({
      title: locale === "ja" ? "正午のシフト確認" : "11:30 shift review",
      fitContent: true,
      maxWidth: "720px",
      content: <ShiftCloseReview
        shiftId={shiftId}
        locale={locale}
        businessDate={businessDate}
        allowKeepOpen
        onClosed={() => {
          setShiftForNoonReview(null);
          window.dispatchEvent(new Event("barticket-shift-updated"));
        }}
        onKeptOpen={(kept) => {
          setShiftForNoonReview(kept);
          window.dispatchEvent(new Event("barticket-shift-updated"));
        }}
      />,
    });
  }, [isManager, locale, modal, nowMs, openModal, shiftForNoonReview, userId]);

  useEffect(() => {
    if (!isOpen) return;
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMainNavigation(true);
    }
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (navRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      closeMainNavigation();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [closeMainNavigation, isOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    function dismiss(event: MouseEvent) {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!canSeeNotices) return;
    let cancelled = false;
    let generation = 0;
    async function load() {
      const request = ++generation;
      const token = getToken();
      try {
        const data = await listNotices();
        if (!cancelled && request === generation && getToken() === token) setAlertCount(data.notices.length);
      } catch {
        if (!cancelled && request === generation && getToken() === token) setAlertCount(0);
      }
    }
    load();
    const timer = window.setInterval(() => { if (shouldPoll()) void load(); }, 20000);
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

      {authenticated ? (
        <MobilePrimary aria-label={locale === "ja" ? "メインナビゲーション" : "Primary navigation"}>
          <MobilePrimaryLink to="/tickets" aria-label={t("tickets")} title={t("tickets")} onClick={() => closeMainNavigation(true)}>
            {({ isActive }) => <Icon name="ListDashes" weight={isActive ? "fill" : "regular"} />}
          </MobilePrimaryLink>
          <MobilePrimaryLink to="/menu" aria-label={t("drinkMenu")} title={t("drinkMenu")} onClick={() => closeMainNavigation(true)}>
            {({ isActive }) => <Icon name="Book" weight={isActive ? "fill" : "regular"} />}
          </MobilePrimaryLink>
          {canSeeNotices ? <MobilePrimaryLink to="/notifications" aria-label={t("notifications")} title={t("notifications")} onClick={() => closeMainNavigation()}>
            {({ isActive }) => <><Icon name="Bell" weight={isActive ? "fill" : "regular"} />
              {alertCount > 0 ? <MenuBadge>{alertCount > 99 ? "99+" : alertCount}</MenuBadge> : null}</>}
          </MobilePrimaryLink> : null}
        </MobilePrimary>
      ) : null}

      {authenticated ? <Hamburger
        ref={menuButtonRef}
        type="button"
        aria-label={locale === "ja" ? "ナビゲーションメニュー" : "Navigation menu"}
        aria-expanded={isOpen}
        aria-controls="main-navigation"
        className="hollow secondary"
        onClick={() => setIsOpen(open => !open)}
      >
        <Icon name={isOpen ? "X" : "List"} />
      </Hamburger> : null}

      <Nav id="main-navigation" ref={navRef} $isOpen={isOpen} $authenticated={authenticated}>
        {authenticated ? <NavTabs>
        <PrimaryNavLink
          onClick={() => closeMainNavigation(true)}
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
        </PrimaryNavLink>

        <PrimaryNavLink
          onClick={() => closeMainNavigation(true)}
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
        </PrimaryNavLink>

        <SecondaryNavLink
          onClick={() => closeMainNavigation(true)}
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
        </SecondaryNavLink>

        <SecondaryNavLink
          onClick={() => closeMainNavigation(true)}
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
        </SecondaryNavLink>

        <SecondaryNavLink onClick={() => closeMainNavigation(true)} to="/receivables">
          {({ isActive }) => <><Icon name="HandCoins" weight={isActive ? "fill" : "regular"} />{locale === "ja" ? "未払い伝票" : "Unpaid tickets"}</>}
        </SecondaryNavLink>

        <SecondaryNavLink onClick={() => closeMainNavigation(true)} to="/schedules">
          {({ isActive }) => <><Icon name="CalendarBlank" weight={isActive ? "fill" : "regular"} />{locale === "ja" ? "シフト予定" : "Schedule"}</>}
        </SecondaryNavLink>

        {isManager ? (
          <SecondaryNavLink onClick={() => closeMainNavigation(true)} to="/admin">
            {({ isActive }) => (
              <>
                <Icon name="GearSix" weight={isActive ? "fill" : "regular"} />
                {locale === "ja" ? "管理" : "Admin"}
              </>
            )}
          </SecondaryNavLink>
        ) : null}
        </NavTabs> : (
          <PublicMenuLink to="/menu" onClick={() => closeMainNavigation(true)}>
            <Icon name="Book" />
            {t("drinkMenu")}
          </PublicMenuLink>
        )}

      <MobileTools>
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
        <LanguageLabel><Icon name="Translate" size="1.25em" /> <LanguageText>{locale === "ja" ? "言語" : "Language"}</LanguageText></LanguageLabel>
        <ToggleTrack $japanese={locale === "ja"} aria-hidden="true">
          <ToggleThumb $japanese={locale === "ja"} />
        </ToggleTrack>
      </LanguageToggle>
      {authenticated ? (
        <MoreWrap ref={moreRef}>
          <MoreButton
            ref={moreButtonRef}
            type="button"
            aria-label={locale === "ja" ? "その他のナビゲーション" : "More navigation options"}
            aria-expanded={moreOpen}
            aria-controls="desktop-more-menu"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <Icon name="DotsThreeOutlineVertical" />
          </MoreButton>
          {moreOpen ? (
            <MoreDropdown id="desktop-more-menu">
              {isManager ? (
                <MoreLink to="/admin" onClick={() => { setMoreOpen(false); closeMainNavigation(true); }}>
                  <Icon name="GearSix" />{locale === "ja" ? "管理" : "Admin"}
                </MoreLink>
              ) : null}
              <MoreLink to="/profile" onClick={() => { setMoreOpen(false); closeMainNavigation(true); }}>
                <Icon name="UserCircle" />{userName ?? t("profile")}
              </MoreLink>
              {canSeeNotices ? (
                <MoreLink to="/notifications" onClick={() => { setMoreOpen(false); closeMainNavigation(true); }}>
                  <Icon name="Bell" />{t("notifications")}
                  {alertCount > 0 ? <AlertCount>{alertCount}</AlertCount> : null}
                </MoreLink>
              ) : null}
              <MoreLink to="/analytics" onClick={() => { setMoreOpen(false); closeMainNavigation(true); }}>
                <Icon name="ChartDonut" />{t("analytics")}
              </MoreLink>
              <MoreLink to="/receivables" onClick={() => { setMoreOpen(false); closeMainNavigation(true); }}>
                <Icon name="HandCoins" />{locale === "ja" ? "未払い伝票" : "Unpaid tickets"}
              </MoreLink>
              <MoreLink to="/schedules" onClick={() => { setMoreOpen(false); closeMainNavigation(true); }}>
                <Icon name="CalendarBlank" />{locale === "ja" ? "シフト予定" : "Schedule"}
              </MoreLink>
            </MoreDropdown>
          ) : null}
        </MoreWrap>
      ) : null}
      </MobileTools>
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
  @media (max-width: 768px) { display: none; }
`;

const MobilePrimary = styled.nav`
  display: none;
  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
`;

const MobilePrimaryLink = styled(RouterNavLink)`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: var(--space-1);
  border-radius: var(--space-1);
  color: var(--neutral-300);
  text-decoration: none;
  &:hover, &:focus-visible, &[aria-current="page"] {
    color: white;
    background: var(--neutral-800);
  }
  &:focus-visible { outline: 2px solid white; }
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
  transform: translate(10%, -10%);
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

    pointer-events: ${({ $isOpen, $authenticated }) =>
    !$authenticated || $isOpen ? "auto" : "none"};
    visibility: ${({ $isOpen, $authenticated }) =>
    !$authenticated || $isOpen ? "visible" : "hidden"};
    transition:
      transform 0.3s ease,
      opacity 0.2s ease,
      visibility 0s linear ${({ $isOpen }) => $isOpen ? "0s" : "0.3s"};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
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

const MobileTools = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-1);
  @media (max-width: 768px) {
    display: contents;
  }
`;

const MoreWrap = styled.div`
  display: block;
  position: relative;
  flex-shrink: 0;
  @media (max-width: 768px) {
    display: none;
  }
`;

const MoreButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--neutral-300);
  border: none;
  padding: var(--space-1);
  cursor: pointer;
  &&:hover {
    background: transparent;
  }
  &:focus-visible { outline: 2px solid white; }
`;

const MoreDropdown = styled.div`
  position: absolute;
  right: 0;
  top: 100%;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  background: var(--neutral-900);
  border: 1px solid var(--neutral-700);
  border-radius: var(--space-2);
  z-index: 200;
`;

const MoreLink = styled(RouterNavLink)`
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--neutral-300);
  text-decoration: none;
  padding: var(--space-1) var(--space-2);
  &:hover, &:focus-visible, &[aria-current="page"] { color: white; background: var(--neutral-800); }
`;

const LanguageToggle = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-0);
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--neutral-300);
  cursor: pointer;
  padding: var(--space-2);

  &:hover { color: white; }
  &:focus-visible { outline: 2px solid white; outline-offset: -2px; }

  @media (max-width: 768px) {
    gap: var(--space-2);
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

const LanguageText = styled.span`
  @media (min-width: 769px) {
    display: none;
  }
`;

const ToggleTrack = styled.span<{ $japanese: boolean }>`
  position: relative;
  display: inline-block;
  width: 64px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 999px;
  background: white;
  border: 1px solid var(--neutral-700);
  box-sizing: border-box;
  overflow: hidden;

  /* The stripes fade away as the Japanese white field takes over. */
  &::before {
    content: "";
    border-radius: inherit;
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(rgb(179, 25, 66) -1px, rgb(179, 25, 66) 4px, rgb(255, 255, 255) 4px, rgb(255, 255, 255) 8px);
    opacity: ${({ $japanese }) => $japanese ? 0 : 1};
    transition: opacity 300ms ease;
  }

  /* Keep the inset outline visible in both languages. */
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    outline: 4px solid var(--background-color);
    outline-offset: -2px;
    pointer-events: none;
    z-index: 2;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before { transition: none; }
  }
`;

const ToggleThumb = styled.span<{ $japanese: boolean }>`
  position: absolute;
  left: 3px;
  top: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${({ $japanese }) => $japanese ? "#BC002D" : "#0A3161"};
  box-shadow: 0 1px 5px rgb(0 0 0 / 25%);
  border: 2px solid white;
  box-sizing: border-box;
  transform: translateX(${({ $japanese }) => $japanese ? "32px" : "0"});
  transition:
    transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 300ms ease;
  pointer-events: none;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
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

  }
`;
const PrimaryNavLink = styled(NavLink)`
  @media (max-width: 768px) { display: none; }
`;

const SecondaryNavLink = styled(NavLink)`
  @media (min-width: 769px) {
    display: none;
  }
`;

const PublicMenuLink = styled(RouterNavLink)`
  display: inline-flex;
  align-items: center;
  gap: var(--space-0);
  padding: var(--space-1);
  color: var(--neutral-200);
  text-decoration: none;
  white-space: nowrap;
  &:hover, &:focus-visible { color: white; }
`;
