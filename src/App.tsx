// src/App.tsx

import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import Tickets from "./pages/Tickets";
import TicketDetails from "./pages/TicketDetails";
import Menu from "./pages/Menu";
import Analytics from "./pages/Analytics";
import Header from "./layout/Header";

export default function App() {
  return (
    <BrowserRouter>
      <Header />

      <Routes>
        <Route path="/" element={<Dashboard />} />

        <Route
          path="/tickets"
          element={<Tickets />}
        />

        <Route
          path="/tickets/:id"
          element={<TicketDetails />}
        />

        <Route
          path="/menu"
          element={<Menu />}
        />

        <Route
          path="/analytics"
          element={<Analytics />}
        />
      </Routes>
    </BrowserRouter>
  );
}