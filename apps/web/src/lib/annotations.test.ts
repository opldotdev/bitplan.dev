import { expect, test } from "bun:test";
import { parseAnnotation, parseAnnotationContent } from "./annotations";

test("encrypted annotations preserve optional dimensions and embedded SVG images", () => {
  const content = {
    alt: "Diagram",
    dataUrl: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"/>')}`,
    type: "image",
  };
  const item = {
    anchor: { point: { x: 0.2, y: 0.3 } },
    content,
    createdAt: "2026-09-12T00:00:00Z",
    id: "note",
    participantId: "person",
    placement: { dx: 0, dy: 0 },
    revision: 1,
    sessionId: "session",
    status: "open",
    target: {
      origin: "h_12345678901234567890",
      sha256: "a".repeat(64),
      version: 1,
    },
    updatedAt: "2026-09-12T00:00:00Z",
  };
  expect(parseAnnotation(item).size).toBeUndefined();
  expect(
    parseAnnotation({ ...item, size: { height: 240, width: 320 } }).size
  ).toEqual({ height: 240, width: 320 });
  expect(parseAnnotationContent(content)).toEqual(content);
  for (const size of [
    { height: 100, width: 0 },
    { height: Number.POSITIVE_INFINITY, width: 320 },
    { height: 1201, width: 320 },
  ]) {
    expect(() => parseAnnotation({ ...item, size })).toThrow();
  }
  for (const dataUrl of [
    "https://example.com/track.svg",
    "data:text/html;base64,PHN2Zz4=",
    "javascript:alert(1)",
  ]) {
    expect(() => parseAnnotationContent({ ...content, dataUrl })).toThrow();
  }
});
