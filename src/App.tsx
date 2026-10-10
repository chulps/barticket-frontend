// src/App.tsx

// import react stuff
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

// import components
import Header from "./layout/Header";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Menu from "./pages/Menu";
import Analytics from "./pages/Analytics";
import ModalHost from "./components/ModalHost"
import { ModalProvider } from "./context/ModalProvider";
import { useState, useEffect } from "react";

import type { MenuData } from "./types/Menu";
import { getMenu } from "./api/menu";


export default function App() {
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [loadingMenu, setLoadingMenu] = useState(true);

  useEffect(() => {
    getMenu()
      .then(setMenu)
      .catch(console.error)
      .finally(() => setLoadingMenu(false));
  }, []);
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>

      <ModalProvider>

        <Header />

        <Routes>
          <Route path="/" element={<Dashboard 
            menu={menu}
            loadingMenu={loadingMenu} />} />

          <Route path="/profile" element={<Profile />} />

          <Route path="/menu" element={<Menu 
            menu={menu}
            loadingMenu={loadingMenu} />} />

          <Route path="/analytics" element={<Analytics />} />
        </Routes>

        <ModalHost />

      </ModalProvider>

    </BrowserRouter>
  );
}