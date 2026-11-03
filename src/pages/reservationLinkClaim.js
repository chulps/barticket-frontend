// A canceled effect releases its claim so a subsequent effect can retry.
export function claimReservationLink(ref, key) {
  if (ref.current?.key === key) return null;
  const claim = { key };
  ref.current = claim;
  return () => { if (ref.current === claim) ref.current = null; };
}

// Only permission/not-found responses are final. Network and server errors are retryable.
export function reservationLinkFailure(error) {
  return error && typeof error === "object" && (error.status === 403 || error.status === 404) ? "unavailable" : "retry";
}

// A retired flight never mutates the current view, even if its promise resolves late.
export function runReservationLinkFlight({ read, isCurrent, onLoaded, onFailure, onSettled }) {
  let active = true;
  const current = () => active && isCurrent();
  void (async () => {
    try {
      if (!current()) return;
      const item = await read();
      if (current()) await onLoaded(item);
    } catch (error) {
      if (current()) onFailure(error);
    } finally {
      if (current()) onSettled();
    }
  })();
  return () => { active = false; };
}
