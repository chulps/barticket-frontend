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

import type { MenuData, MenuItem } from "./types/Menu";
import { getMenu } from "./api/menu";


export default function App() {
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

        <Header />

        <Routes>
          <Route path="/" element={<Navigate to="/tickets" replace />} />
          <Route path="/tickets" element={<Dashboard 
            menu={menu}
            loadingMenu={loadingMenu} />} />

          <Route path="/profile" element={<Profile />} />

          <Route path="/menu" element={<Menu 
            menu={menu}
            loadingMenu={loadingMenu}
            onItemChange={applyMenuItem}
            onItemAdded={addMenuItem} />} />

          <Route path="/analytics" element={<Analytics />} />
          <Route path="/notifications" element={<Notifications />} />
        </Routes>

        <ModalHost />

      </ModalProvider>

    </BrowserRouter>
  );
}