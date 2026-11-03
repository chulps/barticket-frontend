import {createRoot} from "react-dom/client";
import PaidTicketSummary from "../../../src/components/TicketDetails/PaidTicketSummary";
import type {Ticket} from "../../../src/types/Ticket";
import "../../../src/index.css";

const ticket = {
  id: 11,
  name: "Synthetic paid ticket",
  status: "paid",
  items: [{id: 1, name: "Highball", price_key: "standard", quantity: 1, unit_price: 700, subtotal: 700}],
  total: 700,
  amount_paid: 700,
  balance_due: 0,
  guest_count: 1,
  cover_charge_per_person: 0,
  cover_charge_total: 0,
  created_at: 1_793_520_000,
  paid_at: 1_793_520_000,
  cancelled_at: null,
  shift_id: 3,
  payments: [{id: 101, type: "cash", amount: 700, paid_at: 1_793_520_000}],
  payment: {id: 101, type: "cash", amount: 700, paid_at: 1_793_520_000},
} as unknown as Ticket;

createRoot(document.getElementById("root")!).render(
  <main style={{maxWidth: 760, padding: 18}}>
    <PaidTicketSummary ticket={ticket} />
  </main>,
);
