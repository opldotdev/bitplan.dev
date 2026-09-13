export type DrawingTool =
  | "pen"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "cloud";
export interface DrawingPoint {
  x: number;
  y: number;
}
const COLOR = /^#[0-9a-f]{6}$/i;

/** Only application-authored SVG primitives; no user HTML enters the asset. */
export function drawingAsset(
  tool: DrawingTool,
  points: DrawingPoint[],
  color: string
) {
  if (
    !COLOR.test(color) ||
    points.length < 2 ||
    points.length > 5000 ||
    points.some((p) => !(Number.isFinite(p.x) && Number.isFinite(p.y)))
  ) {
    throw new Error("Draw a mark before saving.");
  }
  const selected =
    tool === "pen" ? points : [points[0], points.at(-1) ?? points[0]];
  const left = Math.max(0, Math.min(...selected.map((p) => p.x)) - 8);
  const top = Math.max(0, Math.min(...selected.map((p) => p.y)) - 8);
  const width = Math.max(
    160,
    Math.ceil(Math.max(...selected.map((p) => p.x)) - left + 8)
  );
  const height = Math.max(
    96,
    Math.ceil(Math.max(...selected.map((p) => p.y)) - top + 8)
  );
  if (width > 1200 || height > 1200) {
    throw new Error(
      "Keep each mark within 1200 pixels. Use separate marks for larger drawings."
    );
  }
  const local = selected.map((p) => ({
    x: Math.round(p.x - left),
    y: Math.round(p.y - top),
  }));
  const [a] = local;
  const b = local.at(-1) ?? a;
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x),
    h = Math.abs(b.y - a.y);
  let shape: string;
  switch (tool) {
    case "rectangle":
      shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`;
      break;
    case "ellipse":
      shape = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
      break;
    case "cloud":
      shape = `<path d="M ${x + w * 0.25} ${y + h * 0.72} C ${x} ${y + h * 0.8} ${x} ${y + h * 0.3} ${x + w * 0.2} ${y + h * 0.3} C ${x + w * 0.15} ${y} ${x + w * 0.5} ${y} ${x + w * 0.55} ${y + h * 0.2} C ${x + w * 0.8} ${y} ${x + w} ${y + h * 0.2} ${x + w * 0.88} ${y + h * 0.4} C ${x + w} ${y + h * 0.7} ${x + w * 0.8} ${y + h * 0.9} ${x + w * 0.65} ${y + h * 0.72} C ${x + w * 0.48} ${y + h * 0.9} ${x + w * 0.3} ${y + h * 0.9} ${x + w * 0.25} ${y + h * 0.72} Z"/><circle cx="${x + w * 0.2}" cy="${y + h * 0.92}" r="3"/><circle cx="${x + w * 0.13}" cy="${y + h}" r="2"/>`;
      break;
    case "arrow": {
      const angle = Math.atan2(b.y - a.y, b.x - a.x),
        length = Math.min(16, Math.hypot(b.x - a.x, b.y - a.y) / 3);
      shape = `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y} M ${b.x - length * Math.cos(angle - 0.5)} ${b.y - length * Math.sin(angle - 0.5)} L ${b.x} ${b.y} L ${b.x - length * Math.cos(angle + 0.5)} ${b.y - length * Math.sin(angle + 0.5)}"/>`;
      break;
    }
    case "line":
      shape = `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}"/>`;
      break;
    case "pen":
      shape = `<path d="${local.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ")}"/>`;
      break;
    default:
      throw new Error("Unknown drawing tool.");
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`;
  return {
    dataUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    point: { x: left, y: top },
    size: { height, width },
  };
}
