/** Application content inside encryption; not a new BPLN envelope version. */
export interface DocumentTarget {
  origin: string;
  outpoint?: string;
  sha256: string;
  version: number;
}

export interface AnnotationAnchor {
  /** Stable author-supplied DOM id; absent for a document-level annotation. */
  elementId?: string;
  /** Fractions of the anchored element, not viewport pixels. */
  point: { x: number; y: number };
  /** Quote plus context disambiguates repeated text. Never silently reattach. */
  quote?: { exact: string; prefix: string; suffix: string };
}

export type AnnotationContent =
  | { type: "text"; text: string }
  | { type: "html"; html: string }
  | { type: "image"; dataUrl: string; alt: string }
  | { type: "drawing"; strokes: { x: number; y: number }[][] };

export interface Annotation {
  anchor: AnnotationAnchor;
  content: AnnotationContent;
  createdAt: string;
  id: string;
  participantId: string;
  /** Offset in CSS pixels is presentation only; the anchor never changes on drag. */
  placement: { dx: number; dy: number };
  replyTo?: string;
  revision: number;
  sessionId: string;
  /** Optional CSS-pixel dimensions, encrypted with the annotation. */
  size?: { width: number; height: number };
  status: "open" | "resolved";
  target: DocumentTarget;
  updatedAt: string;
}

export interface AnnotationLayer {
  annotations: Annotation[];
  schema: "bitplan-annotations/1";
  target: DocumentTarget;
}

const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const ORIGIN = /^(?:[0-9a-f]{64}_\d+|h_[a-zA-Z0-9_-]{20})$/;
const OUTPOINT = /^[0-9a-f]{64}_\d+$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX_TEXT = 32_000;
export const MAX_ANNOTATION_BYTES = 1_048_576;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an annotation object.");
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) {
    throw new Error("Invalid annotation text.");
  }
  return value;
}

function identifier(value: unknown): string {
  const result = string(value, 128);
  if (!ID.test(result)) {
    throw new Error("Invalid annotation identifier.");
  }
  return result;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Invalid annotation revision.");
  }
  return value;
}

function coordinate(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error("Invalid annotation position.");
  }
  return value;
}

function point(value: unknown) {
  const p = record(value);
  return { x: coordinate(p.x, 0, 1), y: coordinate(p.y, 0, 1) };
}

export function parseDocumentTarget(value: unknown): DocumentTarget {
  const target = record(value);
  const origin = string(target.origin, 150);
  const sha256 = string(target.sha256, 64);
  if (!(ORIGIN.test(origin) && HASH.test(sha256))) {
    throw new Error("Invalid document target.");
  }
  const outpoint =
    target.outpoint === undefined ? undefined : string(target.outpoint, 90);
  if (
    (outpoint !== undefined && !OUTPOINT.test(outpoint)) ||
    !(origin.startsWith("h_") || outpoint)
  ) {
    throw new Error("On-chain annotations require an exact version outpoint.");
  }
  return {
    origin,
    sha256,
    version: integer(target.version),
    ...(outpoint ? { outpoint } : {}),
  };
}

export function parseAnchor(value: unknown): AnnotationAnchor {
  const anchor = record(value);
  const result: AnnotationAnchor = { point: point(anchor.point) };
  if (anchor.elementId !== undefined) {
    result.elementId = string(anchor.elementId, 512);
  }
  if (anchor.quote !== undefined) {
    const quote = record(anchor.quote);
    result.quote = {
      exact: string(quote.exact, MAX_TEXT),
      prefix: string(quote.prefix, 256),
      suffix: string(quote.suffix, 256),
    };
    if (!result.quote.exact) {
      throw new Error("Selected text cannot be empty.");
    }
  }
  return result;
}

export function parseAnnotationContent(value: unknown): AnnotationContent {
  const content = record(value);
  switch (content.type) {
    case "text":
      return { text: string(content.text, MAX_TEXT), type: "text" };
    case "html":
      return { html: string(content.html, 200_000), type: "html" };
    case "image": {
      const dataUrl = string(content.dataUrl, MAX_ANNOTATION_BYTES);
      // SVG must remain in an <img> image context, never inline DOM or an object.
      if (
        !/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[a-zA-Z0-9+/]+={0,2}$/.test(
          dataUrl
        )
      ) {
        throw new Error("Use an embedded PNG, JPEG, WebP, GIF, or SVG image.");
      }
      return { alt: string(content.alt, 2000), dataUrl, type: "image" };
    }
    case "drawing": {
      if (!Array.isArray(content.strokes) || content.strokes.length > 100) {
        throw new Error("Too many drawing strokes.");
      }
      let count = 0;
      const strokes = content.strokes.map((stroke) => {
        if (!Array.isArray(stroke) || (count += stroke.length) > 10_000) {
          throw new Error("Drawing is too large.");
        }
        return stroke.map(point);
      });
      return { strokes, type: "drawing" };
    }
    default:
      throw new Error("Unsupported annotation content type.");
  }
}

export function parseAnnotation(value: unknown): Annotation {
  const item = record(value);
  const placement = record(item.placement);
  if (item.status !== "open" && item.status !== "resolved") {
    throw new Error("Invalid annotation status.");
  }
  const createdAt = string(item.createdAt, 32);
  const updatedAt = string(item.updatedAt, 32);
  if (
    !(
      Number.isFinite(Date.parse(createdAt)) &&
      Number.isFinite(Date.parse(updatedAt))
    )
  ) {
    throw new Error("Invalid annotation timestamp.");
  }
  const annotation: Annotation = {
    anchor: parseAnchor(item.anchor),
    content: parseAnnotationContent(item.content),
    createdAt,
    id: identifier(item.id),
    participantId: identifier(item.participantId),
    placement: {
      dx: coordinate(placement.dx, -10_000, 10_000),
      dy: coordinate(placement.dy, -10_000, 10_000),
    },
    revision: integer(item.revision),
    sessionId: identifier(item.sessionId),
    status: item.status,
    target: parseDocumentTarget(item.target),
    updatedAt,
    ...(item.replyTo === undefined
      ? {}
      : { replyTo: identifier(item.replyTo) }),
  };
  if (item.size !== undefined) {
    const size = record(item.size);
    annotation.size = {
      height: coordinate(size.height, 96, 1200),
      width: coordinate(size.width, 160, 1200),
    };
  }
  if (
    new TextEncoder().encode(JSON.stringify(annotation)).byteLength >
    MAX_ANNOTATION_BYTES
  ) {
    throw new Error("Annotation exceeds the size limit.");
  }
  return annotation;
}

export function sameDocumentTarget(
  a: DocumentTarget,
  b: DocumentTarget
): boolean {
  return (
    a.origin === b.origin &&
    a.version === b.version &&
    a.sha256 === b.sha256 &&
    a.outpoint === b.outpoint
  );
}

/** Validate decrypted layer content before allowing the trusted UI to consume it. */
export function parseAnnotationLayer(value: unknown): AnnotationLayer {
  const layer = record(value);
  if (
    layer.schema !== "bitplan-annotations/1" ||
    !Array.isArray(layer.annotations) ||
    layer.annotations.length > 1000
  ) {
    throw new Error("Invalid annotation layer.");
  }
  const target = parseDocumentTarget(layer.target);
  const annotations = layer.annotations.map(parseAnnotation);
  const ids = new Set<string>();
  for (const item of annotations) {
    if (ids.has(item.id) || !sameDocumentTarget(item.target, target)) {
      throw new Error("Duplicate annotation or mismatched document target.");
    }
    ids.add(item.id);
  }
  for (const item of annotations) {
    if (item.replyTo && (item.replyTo === item.id || !ids.has(item.replyTo))) {
      throw new Error("Invalid annotation reply target.");
    }
  }
  return { annotations, schema: "bitplan-annotations/1", target };
}
