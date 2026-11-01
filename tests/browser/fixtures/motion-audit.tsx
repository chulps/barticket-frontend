import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import TicketActionFeedback from '../../../src/components/TicketActionFeedback';
import type { TicketActionFeedback as Feedback } from '../../../src/pages/ticketActionFeedback';
import TicketSidebar from '../../../src/components/TicketSidebar';
import type { Ticket } from '../../../src/types/Ticket';
import '../../../src/index.css';

const tickets: Ticket[] = (['open', 'paid', 'cancelled'] as const).flatMap((status, group) =>
  Array.from({ length: 10 }, (_, index) => ({
    id: group * 100 + index + 1, name: `${status} fixture ${index + 1}`, status,
    items: [], created_at: 1800000000, updated_at: 1800000000, cancelled_at: null,
    created_by: 'Synthetic fixture', shiftId: null, payment: null,
  })));
export function Fixture() {
  const [activeTab, setActiveTab] = useState<Ticket['status']>('open');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [selected, setSelected] = useState(1);
  const [lastSelected, setLastSelected] = useState({});
  const forTab = (status: Ticket['status']) => tickets.filter(ticket => ticket.status === status);
  return <main style={{ maxWidth: 520, padding: 18 }}>
    <label htmlFor="motion-input">Motion input</label><input id="motion-input" />
    <button data-global-button>Global button</button>
    {(['created', 'paid', 'reopened', 'cancelled'] as const).map(cue => <button key={cue} data-cue={cue} onClick={() => setFeedback(previous => ({ sequence: (previous?.sequence ?? 0) + 1, ticketId: 1, cue }))}>{cue}</button>)}
    <TicketActionFeedback feedback={feedback} />
    <span className="blink" data-blink>Static status</span>
    <output data-selection>{selected}</output>
    <TicketSidebar activeTab={activeTab} setActiveTab={setActiveTab} ticketsForTab={forTab}
      visibleTickets={forTab(activeTab)} selectedTicketId={selected} setSelectedTicketId={setSelected}
      setShowTicketDetails={() => {}} handleCreateTicket={() => {}} getTicketTotal={() => 500}
      lastSelectedTicket={lastSelected} setLastSelectedTicket={setLastSelected} nightOpen canCreate />
  </main>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter><Fixture /></MemoryRouter>);
