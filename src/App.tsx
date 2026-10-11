// src/App.tsx

// import react stuff
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
import Analytics from "./pages/Analytics";
import Notifications from "./pages/Notifications";
import ModalHost from "./components/ModalHost"
import { ModalProvider } from "./context/ModalProvider";
import { useState, useEffect } from "react";
import { accountApi } from "./api/account";
import { getToken, setToken, ApiError } from "./api/client";

import type { MenuData, MenuItem } from "./types/Menu";
import { getMenu } from "./api/menu";


export default function App() {
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
    return () => { version++; window.removeEventListener("barticket-auth", checkAuth); };
  }, []);

  const [menu, setMenu] = useState<MenuData | null>(null);
  const [loadingMenu, setLoadingMenu] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getMenu();
        if (!cancelled) setMenu(data);
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoadingMenu(false);
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
  }, []);

  function addMenuItem(created: MenuItem) {
    setMenu((current) => {
      if (!current) return current;
      if (current.items.some((item) => item.id === created.id)) return current;
      return {
        ...current,
        items: [...current.items, { ...created, prices: created.prices ?? {} }].sort(
          (a, b) => a.id - b.id,
        ),
      };
    });
  }

  function applyMenuItem(updated: MenuItem) {
    setMenu((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) =>
          item.id === updated.id
            ? { ...item, inStock: updated.inStock, prices: updated.prices ?? item.prices }
            : item,
        ),
      };
    });
  }
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>

      <ModalProvider>

        <Header authenticated={authenticated === true} />

        <Routes>
          <Route path="/" element={authenticated === null ? null : authenticated ? <Navigate to="/tickets" replace /> : <Profile />} />
          <Route path="/tickets" element={authenticated === null ? null : authenticated ? <Dashboard
            menu={menu}
            loadingMenu={loadingMenu} /> : <Navigate to="/" replace />} />

          <Route path="/profile" element={authenticated === null ? null : authenticated ? <Profile /> : <Navigate to="/" replace />} />

          <Route path="/menu" element={authenticated === null ? null : authenticated ? <Menu
            menu={menu}
            loadingMenu={loadingMenu}
            onItemChange={applyMenuItem}
            onItemAdded={addMenuItem} /> : <Navigate to="/" replace />} />

          <Route path="/analytics" element={authenticated === null ? null : authenticated ? <Analytics /> : <Navigate to="/" replace />} />
          <Route path="/notifications" element={authenticated === null ? null : authenticated ? <Notifications /> : <Navigate to="/" replace />} />
        </Routes>

        <ModalHost />

      </ModalProvider>

    </BrowserRouter>
  );
}