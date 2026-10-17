/** Choose only a ticket actually present on the current operational board. */
export function resolveVisibleSelection<T extends { id: number }>(
  visible: readonly T[],
  preferredId: number | undefined | null,
): number | null {
  return visible.find(ticket => ticket.id === preferredId)?.id ?? visible[0]?.id ?? null;
}
