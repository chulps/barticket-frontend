// src/App.tsx

// import react stuff
import styled from "styled-components";
import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { isApiAvailable } from "./api/client";
import { shouldPoll, startRealtime } from "./api/realtime";
import { useI18n } from "./i18n";
import { notifyMutation } from "./utils/mutationFeedback";
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
import Menu from "./pages/Menu";
import ModalHost from "./components/ModalHost"
import MutationToastHost from "./components/MutationToastHost";
import { ModalProvider } from "./context/ModalProvider";
import { accountApi } from "./api/account";
import { getToken, setToken, ApiError } from "./api/client";

import type { MenuData, MenuItem, Prices } from "./types/Menu";
import {
  archiveMenuItem, getMenu, restoreMenuItem,
  setMenuPrices, setMenuStock, updateMenuItem, type MenuItemEdit,
} from "./api/menu";
import { replaceMenuItem, optimisticStock, optimisticPrices, reconcileMenuSnapshot } from "./hooks/optimisticOperations";
import { createSingleFlightRefresh } from "./hooks/singleFlightRefresh";

const Admin = lazy(() => import("./pages/Admin"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Receivables = lazy(() => import("./pages/Receivables"));
const Schedules = lazy(() => import("./pages/Schedules"));


export default function App() {
  const { locale, t } = useI18n();
  const [apiAvailable, setApiAvailable] = useState(isApiAvailable);
  useEffect(() => {
    const updateStatus = () => setApiAvailable(isApiAvailable());
    window.addEventListener("barticket-api-status", updateStatus);
    return () => window.removeEventListener("barticket-api-status", updateStatus);
  }, []);

  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    if (authenticated !== true) return;
    const stopRealtime = startRealtime();
    const onExpired = () => {
      setToken(null);
      setAuthenticated(false);
    };
    window.addEventListener("barticket-session-expired", onExpired);
    return () => {
      window.removeEventListener("barticket-session-expired", onExpired);
      stopRealtime();
    };
  }, [authenticated]);

  useEffect(() => {
    let version = 0;
    let verifiedToken: string | null = null;
    async function checkAuth(reset = true) {
      const current = ++version;
      const token = getToken();
      // Unmount private ticket/admin/profile state immediately on any auth
      // change, including a session switch in another browser tab.
      if (reset || token !== verifiedToken) setAuthenticated(null);
      if (token !== verifiedToken) verifiedToken = null;
      if (!token) { setAuthenticated(false); return; }
      try {
        await accountApi.me();
        if (current === version && getToken() === token) { verifiedToken = token; setAuthenticated(true); }
      } catch (error) {
        if (current !== version || getToken() !== token) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          // A stale 401 from the previous account must not sign out a new one.
          verifiedToken = null;
          setToken(null);
          setAuthenticated(false);
        } else {
          // Offline sessions preserve access to operational UI; sensitive
          // manager data must independently revalidate its role on load.
          setAuthenticated(true);
        }
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === "barticket_token" || event.key === null) {
        // "storage" fires in OTHER tabs, not this tab; it does not propagate
        // through setToken here or create an auth-event loop.
        window.dispatchEvent(new Event("barticket-auth"));
      }
    };
    const onAuth = () => { void checkAuth(); };
    const onRestored = () => { void checkAuth(false); };
    void checkAuth();
    window.addEventListener("barticket-auth", onAuth);
    window.addEventListener("barticket-api-restored", onRestored);
    window.addEventListener("storage", onStorage);
    return () => {
      version++;
      window.removeEventListener("barticket-auth", onAuth);
      window.removeEventListener("barticket-api-restored", onRestored);
      window.removeEventListener("storage", onStorage);
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
      const oldPrices = before.prices ?? {};
      const newPrices = result.prices ?? {};
      const ticketLinesChanged = before.name !== result.name ||
        (["standard", "15ml", "30ml"] as const)
          .some(key => oldPrices[key] !== newPrices[key]);
      if (ticketLinesChanged) {
        // The backend has committed ticket snapshots and totals. Re-read them
        // immediately on this device; other devices receive backend push or poll.
        window.dispatchEvent(new Event("barticket-push"));
        notifyMutation("info", t("menuTicketsMayHaveChanged"));
      }
      return true;
    } catch (error) {
      menuRevision.current++;
      mergeMenuItem(before);
      throw error;
    } finally {
      menuRevision.current++;
      pendingMenuItems.current.delete(id);
      setPendingMenuIds([...pendingMenuItems.current]);
      window.dispatchEvent(new Event("barticket-menu-updated"));
    }
  };

  const changeStock = (item: MenuItem) => mutateMenuItem(item.id,
    optimisticStock,
    () => setMenuStock(item.id, item.inStock === false));

  const changePrices = (item: MenuItem, prices: Prices) => mutateMenuItem(item.id,
    current => optimisticPrices(current, prices),
    () => setMenuPrices(item.id, prices));

  // Keep the same per-item single-flight guard used by price/stock changes.
  // Do not optimistically publish unsaved names or price changes across devices.
  const saveMenuDetails = (item: MenuItem, input: MenuItemEdit) => mutateMenuItem(
    item.id, current => current, () => updateMenuItem(item.id, input));

  const archiveMenu = async (item: MenuItem): Promise<boolean> => {
    const saved = await mutateMenuItem(item.id, current => current,
      () => archiveMenuItem(item.id));
    if (!saved) return false;
    menuRevision.current++;
    const current = menuRef.current;
    if (current) updateMenu({ ...current, items: current.items.filter(row => row.id !== item.id) });
    return true;
  };

  const restoreMenu = async (item: MenuItem): Promise<boolean> => {
    if (pendingMenuItems.current.has(item.id)) return false;
    pendingMenuItems.current.add(item.id);
    setPendingMenuIds([...pendingMenuItems.current]);
    try {
      const saved = await restoreMenuItem(item.id);
      menuRevision.current++;
      const current = menuRef.current;
      if (current) updateMenu({
        ...current,
        items: [...current.items.filter(row => row.id !== saved.id), saved]
          .sort((a, b) => a.id - b.id),
      });
      return true;
    } finally {
      pendingMenuItems.current.delete(item.id);
      setPendingMenuIds([...pendingMenuItems.current]);
      window.dispatchEvent(new Event("barticket-menu-updated"));
    }
  };

  useEffect(() => {
    // A single read in flight plus one coalesced pending refresh prevents an
    // older GET from committing after a newer one, without GET storms.
    // Revision checks still reject reads overtaken by a local optimistic write.
    const reader = createSingleFlightRefresh({
      read: getMenu,
      currentRevision: () => menuRevision.current,
      onSnapshot: data => {
        updateMenu(reconcileMenuSnapshot(data, menuRef.current, pendingMenuItems.current));
        setMenuError(false);
      },
      onError: error => {
        setMenuError(true);
        // Offline state is shown once in the persistent banner.
        if (isApiAvailable()) console.error(error);
      },
      onSettled: () => setLoadingMenu(false),
    });
    const load = () => reader.request();
    load();
    const timer = window.setInterval(() => { if (shouldPoll()) load(); }, 20000);
    window.addEventListener("barticket-notices", load);
    window.addEventListener("barticket-menu-updated", load);
    window.addEventListener("barticket-retry-menu", load);
    window.addEventListener("online", load);
    return () => {
      reader.dispose();
      window.clearInterval(timer);
      window.removeEventListener("barticket-notices", load);
      window.removeEventListener("barticket-menu-updated", load);
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

        <Header authenticated={authenticated === true || (authenticated === null && Boolean(getToken()))} />
        {!apiAvailable ? (
          <ConnectionBanner role="status" aria-live="polite">
            {locale === "ja"
              ? "APIに接続できません。復旧後に自動で再読み込みします。支払いなどの操作は再試行する前に確認してください。"
              : "Connection to BarTicket is unavailable. Data will refresh when it returns. Check payment status before retrying an action."}
          </ConnectionBanner>
        ) : null}

        <Suspense fallback={<RouteLoading role="status" aria-live="polite">
          {locale === "ja" ? "読み込み中…" : "Loading…"}
        </RouteLoading>}>
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
              onSaveItem={saveMenuDetails}
              onArchiveItem={archiveMenu}
              onRestoreItem={restoreMenu}
              pendingMenuIds={pendingMenuIds}
              onItemAdded={addMenuItem} />} />

            <Route path="/analytics" element={authenticated === null ? null : authenticated ? <Analytics /> : <Navigate to="/" replace />} />
            <Route path="/notifications" element={authenticated === null ? null : authenticated ? <Notifications /> : <Navigate to="/" replace />} />
            <Route path="/receivables" element={authenticated === null ? null : authenticated ? <Receivables /> : <Navigate to="/" replace />} />
            <Route path="/schedules" element={authenticated === null ? null : authenticated ? <Schedules /> : <Navigate to="/" replace />} />
          </Routes>
        </Suspense>

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

const RouteLoading = styled.div`
  padding: var(--space-4);
  color: var(--text-secondary);
  text-align: center;
`;
