// Owns a single in-memory snapshot. Every authorization event retires all
// outstanding reads, even when the new token happens to equal the old token.
export function createPendingReservations({ getToken, getViewer, getInbox, publish }) {
  let generation = 0, request = 0, stopped = false, manager = false, denied = false;
  let session = null;
  const send = (status, inbox = null) => publish({ status, count: inbox ? inbox.pending_requests.length : null, inbox, token: session, epoch: generation });
  const current = (epoch, token) => !stopped && generation === epoch && getToken() === token;
  function rejectAuthorization(error, expectedEpoch) {
    if (!error || typeof error !== 'object' || (error.status !== 401 && error.status !== 403) || !current(expectedEpoch, session)) return false;
    manager = false;
    denied = true;
    generation++;
    request++;
    send('role-error');
    return true;
  }
  let flight = null;
  async function refresh() {
    if (!manager || !session) return;
    const epoch = generation, token = session;
    if (flight && flight.epoch === epoch) { flight.rerun = true; return; }
    const own = { epoch, rerun: false };
    flight = own;
    const id = ++request;
    try {
      const inbox = await getInbox();
      if (current(epoch, token) && id === request && !own.rerun) send('ready', inbox);
    } catch (error) {
      if (current(epoch, token) && id === request && !own.rerun) {
        if (!rejectAuthorization(error, epoch)) send('error');
      }
    } finally {
      if (flight === own) flight = null;
      if (own.rerun && current(epoch, token) && manager) void refresh();
    }
  }
  async function authorize(force = false) {
    if (denied && !force) return;
    denied = false;
    const epoch = ++generation;
    ++request;
    manager = false;
    session = getToken();
    const token = session;
    send(token ? 'checking' : 'anonymous');
    if (!token) return;
    try {
      const viewer = await getViewer();
      if (!current(epoch, token)) return;
      if (viewer.role !== 'manager') { send('staff'); return; }
      manager = true;
      send('loading');
      await refresh();
    } catch (error) {
      if (current(epoch, token) && !rejectAuthorization(error, epoch)) send('role-error');
    }
  }
  return { authorize, refresh, rejectAuthorization, stop() { stopped = true; generation++; request++; } };
}

// Read the live store at the instant an action or async response is handled.
export function isCurrentReservationManager(snapshot, token, epoch) {
  return !!token && snapshot.token === token && snapshot.epoch === epoch &&
    (snapshot.status === 'loading' || snapshot.status === 'ready' || snapshot.status === 'error');
}
