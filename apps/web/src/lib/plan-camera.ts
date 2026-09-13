export interface PlanCamera {
  scale: number;
  x: number;
  y: number;
}
/** Keep the document point under the wheel fixed while changing magnification. */
export function zoomPlanCamera(
  camera: PlanCamera,
  x: number,
  y: number,
  delta: number
): PlanCamera {
  const scale = Math.max(
    0.25,
    Math.min(
      4,
      camera.scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002)
    )
  );
  const ratio = scale / camera.scale;
  return {
    scale,
    x: x - (x - camera.x) * ratio,
    y: y - (y - camera.y) * ratio,
  };
}
