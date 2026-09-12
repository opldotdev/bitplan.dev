export interface SketchPoint {
  x: number;
  y: number;
}
export interface SketchMark {
  color: string;
  points: SketchPoint[];
  tool: "pen" | "rectangle" | "ellipse";
}

export function insideLasso(
  point: SketchPoint,
  polygon: SketchPoint[]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function paintMark(ctx: CanvasRenderingContext2D, mark: SketchMark) {
  const [start] = mark.points;
  const end = mark.points.at(-1);
  if (!(start && end)) {
    return;
  }
  ctx.strokeStyle = mark.color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (mark.tool === "rectangle") {
    ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (mark.tool === "ellipse") {
    ctx.ellipse(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      Math.abs(end.x - start.x) / 2,
      Math.abs(end.y - start.y) / 2,
      0,
      0,
      Math.PI * 2
    );
  } else {
    ctx.moveTo(start.x, start.y);
    for (const point of mark.points) {
      ctx.lineTo(point.x, point.y);
    }
    if (mark.points.length === 1) {
      ctx.lineTo(start.x + 0.1, start.y);
    }
  }
  ctx.stroke();
}
