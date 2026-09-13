/** Keep the anchor exact; flip the attached card only when it would leave the viewport. */
export function annotationCardOffset(
  point: { x: number; y: number },
  viewport: { width: number; height: number },
  card: { width: number; height: number }
) {
  return {
    x:
      point.x + card.width > viewport.width
        ? -Math.min(Math.max(0, point.x), card.width)
        : 0,
    y:
      point.y + card.height > viewport.height
        ? -Math.min(Math.max(0, point.y), card.height)
        : 0,
  };
}
/** Move the visual card without changing its document/element anchor. */
export function moveAnnotationPlacement(
  placement: { dx: number; dy: number },
  delta: { x: number; y: number }
) {
  const clamp = (value: number) =>
    Math.max(-10_000, Math.min(10_000, Math.round(value)));
  return {
    dx: clamp(placement.dx + delta.x),
    dy: clamp(placement.dy + delta.y),
  };
}
