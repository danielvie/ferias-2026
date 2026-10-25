/** Width and color vary independently; tick thickness is not part of this profile. */
export function markerEmphasis(index: number, hovered: number | null): { width: number; color: number } {
  if (hovered === null) return { width: 0, color: 0 };
  const distance = Math.abs(index - hovered);
  if (distance === 0) return { width: 1, color: 1 };
  if (distance === 1) return { width: .5, color: .2 };
  return { width: 0, color: 0 };
}
