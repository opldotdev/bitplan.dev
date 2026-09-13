import { expect, test } from "bun:test";
import { type DrawingTool, drawingAsset } from "./drawing-asset";

test("drawing tools produce bounded standalone SVG assets at their original location", () => {
  for (const tool of [
    "pen",
    "rectangle",
    "ellipse",
    "line",
    "arrow",
    "cloud",
  ] as DrawingTool[]) {
    const asset = drawingAsset(
      tool,
      [
        { x: 100, y: 200 },
        { x: 300, y: 400 },
      ],
      "#ab1234"
    );
    expect(asset.point).toEqual({ x: 92, y: 192 });
    expect(asset.size).toEqual({ height: 216, width: 216 });
    expect(atob(asset.dataUrl.split(",")[1])).toContain('stroke="#ab1234"');
  }
  expect(() =>
    drawingAsset(
      "pen",
      [
        { x: Number.NaN, y: 0 },
        { x: 1, y: 2 },
      ],
      "#ab1234"
    )
  ).toThrow();
  expect(() =>
    drawingAsset(
      "pen",
      [
        { x: 0, y: 0 },
        { x: 1, y: 2 },
      ],
      '" onload="alert(1)'
    )
  ).toThrow();
  expect(() =>
    drawingAsset(
      "line",
      [
        { x: 0, y: 0 },
        { x: 2000, y: 2 },
      ],
      "#ab1234"
    )
  ).toThrow();
});
