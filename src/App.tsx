// src/App.tsx

// import react stuff
import styled from "styled-components";
import { isApiAvailable } from "./api/client";
import { useI18n } from "./i18n";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

// import components
import Header from "./layout/Header";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Menu from "./pages/Menu";
import Analytics from "./pages/Analytics";
import Notifications from "./pages/Notifications";
import ModalHost from "./components/ModalHost"
import MutationToastHost from "./components/MutationToastHost";
import { ModalProvider } from "./context/ModalProvider";
import { useState, useEffect, useRef } from "react";
import { accountApi } from "./api/account";
import { getToken, setToken, ApiError } from "./api/client";

import type { MenuData, MenuItem, Prices } from "./types/Menu";
import { getMenu, setMenuPrices, setMenuStock } from "./api/menu";
import { replaceMenuItem, optimisticStock, optimisticPrices, reconcileMenuSnapshot } from "./hooks/optimisticOperations";


export default function App() {
  const { locale } = useI18n();
  const [apiAvailable, setApiAvailable] = useState(isApiAvailable);
  useEffect(() => {
    const updateStatus = () => setApiAvailable(isApiAvailable());
    window.addEventListener("barticket-api-status", updateStatus);
    return () => window.removeEventListener("barticket-api-status", updateStatus);
  }, []);

  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let version = 0;
    async function checkAuth() {
      const current = ++version;
      if (!getToken()) { setAuthenticated(false); return; }
      try {
        await accountApi.me();
        if (current === version) setAuthenticated(true);
      } catch (error) {
        if (current !== version) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setToken(null);
          setAuthenticated(false);
        } else {
          // A temporary network failure must not discard a valid saved session.
          setAuthenticated(true);
        }
      }
    }
    void checkAuth();
    window.addEventListener("barticket-auth", checkAuth);
    window.addEventListener("barticket-api-restored", checkAuth);
    return () => {
      version++;
      window.removeEventListener("barticket-auth", checkAuth);
      window.removeEventListener("barticket-api-restored", checkAuth);
    };
  }, []);

  const [menu, setMenu] = useState<MenuData | null>(null);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [menuError, setMenuError] = useState(false);
  const menuRef = useRef<MenuData | null>(null);
  const menuRevision = useRef(0);
  const pendingMenuItems = useRef(new Set<number>());
  const [pendingMenuIds, setPendingMenuIds] = useState<number[]>([]);

  const updateMenu = (next: MenuData | null) => {
    menuRef.current = next;
    setMenu(next);
  };

  const mergeMenuItem = (updated: MenuItem) => {
    const current = menuRef.current;
    if (!current) return;
    updateMenu(replaceMenuItem(current, updated));
  };

  // One active write per item prevents competing stock/price changes from
  // rolling each other back. Poll results cannot erase unacknowledged changes.
  const mutateMenuItem = async (
    id: number,
    optimistic: (item: MenuItem) => MenuItem,
    send: () => Promise<MenuItem>,
  ): Promise<boolean> => {
    if (pendingMenuItems.current.has(id)) return false;
    const before = menuRef.current?.items.find(item => item.id === id);
    if (!before) return false;
    menuRevision.current++;
    pendingMenuItems.current.add(id);
    setPendingMenuIds([...pendingMenuItems.current]);
    mergeMenuItem(optimistic(before));
    try {
      const result = await send();
      menuRevision.current++;
      mergeMenuItem(result);
      return true;
    } catch (error) {
      menuRevision.current++;
      mergeMenuItem(before);
      throw error;
    } finally {
      menuRevision.current++;
      pendingMenuItems.current.delete(id);
      setPendingMenuIds([...pendingMenuItems.current]);
    }
  };

  const changeStock = (item: MenuItem) => mutateMenuItem(item.id,
    optimisticStock,
    () => setMenuStock(item.id, item.inStock === false));

  const changePrices = (item: MenuItem, prices: Prices) => mutateMenuItem(item.id,
    current => optimisticPrices(current, prices),
    () => setMenuPrices(item.id, prices));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const revision = menuRevision.current;
      try {
        const data = await getMenu();
        if (!cancelled && revision === menuRevision.current) {
          // While a write is pending, preserve the optimistic item from the
          // current view rather than replacing it with an older server snapshot.
          updateMenu(reconcileMenuSnapshot(data, menuRef.current, pendingMenuItems.current));
          setMenuError(false);
        }
      } catch (error) {
        if (!cancelled) setMenuError(true);
        // Offline state is shown once in the persistent banner, not logged every poll.
        if (isApiAvailable()) console.error(error);
      } finally {
        if (!cancelled) setLoadingMenu(false);
      }
    }
    load();
    const timer = window.setInterval(load, 20000);
    window.addEventListener("barticket-notices", load);
    window.addEventListener("barticket-retry-menu", load);
    window.addEventListener("online", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("barticket-notices", load);
      window.removeEventListener("barticket-retry-menu", load);
      window.removeEventListener("online", load);
    };
  }, []);

  function addMenuItem(created: MenuItem) {
    const current = menuRef.current;
    if (!current || current.items.some(item => item.id === created.id)) return;
    menuRevision.current++;
    updateMenu({ ...current, items: [...current.items, { ...created, prices: created.prices ?? {} }]
      .sort((a, b) => a.id - b.id) });
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>

      <ModalProvider>

        <Header authenticated={authenticated === true} />
        {!apiAvailable ? (
          <ConnectionBanner role="status" aria-live="polite">
            {locale === "ja"
              ? "APIに接続できません。復旧後に自動で再読み込みします。支払いなどの操作は再試行する前に確認してください。"
              : "Connection to BarTicket is unavailable. Data will refresh when it returns. Check payment status before retrying an action."}
          </ConnectionBanner>
        ) : null}

        <Routes>
          <Route path="/" element={authenticated === null ? null : authenticated ? <Navigate to="/tickets" replace /> : <Profile />} />
          <Route path="/tickets" element={authenticated === null ? null : authenticated ? <Dashboard
            menu={menu}
            loadingMenu={loadingMenu} menuError={menuError} /> : <Navigate to="/" replace />} />

          <Route path="/admin" element={authenticated === null ? null : authenticated ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="/admin/staff/:staffId" element={authenticated === null ? null : authenticated ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="/admin/staff/:staffId/audit" element={authenticated === null ? null : authenticated ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="/profile" element={authenticated === null ? null : authenticated ? <Profile /> : <Navigate to="/" replace />} />

          <Route path="/menu" element={authenticated === null ? null : <Menu
            authenticated={authenticated}
            menu={menu}
            loadingMenu={loadingMenu}
            menuError={menuError}
            onToggleStock={changeStock}
            onSavePrices={changePrices}
            pendingMenuIds={pendingMenuIds}
            onItemAdded={addMenuItem} />} />

          <Route path="/analytics" element={authenticated === null ? null : authenticated ? <Analytics /> : <Navigate to="/" replace />} />
          <Route path="/notifications" element={authenticated === null ? null : authenticated ? <Notifications /> : <Navigate to="/" replace />} />
        </Routes>

        <ModalHost />
        <MutationToastHost />

      </ModalProvider>

    </BrowserRouter>
  );
}
const ConnectionBanner = styled.div`
  position: sticky;
  top: 64px;
  z-index: 90;
  padding: var(--space-2);
  border: 1px solid var(--danger-500);
  background: var(--danger-950);
  color: white;
  text-align: center;
  @media (min-width: 768px) { top: 56px; }
`;
