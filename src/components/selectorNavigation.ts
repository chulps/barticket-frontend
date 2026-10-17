/** Arrow keys move among a set of mutually exclusive buttons, with wraparound.
 * Returning null leaves Tab/Enter/Space native button behavior unchanged. */
export function nextSelectorIndex(index: number, count: number, key: string): number | null {
  if (count <= 0 || index < 0 || index >= count) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + count) % count;
  return null;
}
