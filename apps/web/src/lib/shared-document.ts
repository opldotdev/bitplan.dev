import { type DocumentTarget, parseDocumentTarget } from "./annotations";
import { isHostedId } from "./hosted-id";

export interface SharedDocument {
  base: DocumentTarget;
  html: string;
  schema: "bitplan-document/1";
  sha256: string;
}

export async function sharedDocument(
  base: DocumentTarget,
  html: string
): Promise<SharedDocument> {
  const parsedBase = parseDocumentTarget(base);
  if (!isHostedId(parsedBase.origin)) {
    throw new Error("Live document editing currently requires a hosted plan.");
  }
  const bytes = new TextEncoder().encode(html);
  if (!html.trim() || bytes.length > 180_000) {
    throw new Error("Use nonempty HTML under 180 KB for live editing.");
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return { base: parsedBase, html, schema: "bitplan-document/1", sha256 };
}

export async function parseSharedDocument(
  value: unknown
): Promise<SharedDocument> {
  if (
    !value ||
    typeof value !== "object" ||
    !("schema" in value) ||
    value.schema !== "bitplan-document/1" ||
    !("base" in value) ||
    !("html" in value) ||
    typeof value.html !== "string" ||
    !("sha256" in value)
  ) {
    throw new Error("Invalid shared document.");
  }
  const parsed = await sharedDocument(
    parseDocumentTarget(value.base),
    value.html
  );
  if (parsed.sha256 !== value.sha256) {
    throw new Error("Shared document hash mismatch.");
  }
  return parsed;
}
