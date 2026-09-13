import { type DocumentTarget, parseDocumentTarget } from "./annotations";
import { isHostedId } from "./hosted-id";

export interface SharedDocument {
  base: DocumentTarget;
  html?: string;
  schema: "bitplan-document/1";
  sha256: string;
  title?: string;
}

export async function sharedDocument(
  base: DocumentTarget,
  html: string | undefined,
  title?: string
): Promise<SharedDocument> {
  const parsedBase = parseDocumentTarget(base);
  if (
    title !== undefined &&
    (typeof title !== "string" || !title.trim() || title.trim().length > 160)
  ) {
    throw new Error("Use a plan name of 1–160 characters.");
  }
  if (!isHostedId(parsedBase.origin)) {
    throw new Error("Live document editing currently requires a hosted plan.");
  }
  if (html === undefined) {
    if (title === undefined) {
      throw new Error("A title-only update needs a name.");
    }
    return {
      base: parsedBase,
      schema: "bitplan-document/1",
      sha256: parsedBase.sha256,
      title: title.trim(),
    };
  }
  const bytes = new TextEncoder().encode(html);
  if (!html.trim() || bytes.length > 180_000) {
    throw new Error("Use nonempty HTML under 180 KB for live editing.");
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return {
    base: parsedBase,
    html,
    schema: "bitplan-document/1",
    sha256,
    ...(title === undefined ? {} : { title: title.trim() }),
  };
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
    ("html" in value && typeof value.html !== "string") ||
    !("sha256" in value)
  ) {
    throw new Error("Invalid shared document.");
  }
  const parsed = await sharedDocument(
    parseDocumentTarget(value.base),
    "html" in value ? (value.html as string) : undefined,
    "title" in value ? (value.title as string) : undefined
  );
  if (parsed.sha256 !== value.sha256) {
    throw new Error("Shared document hash mismatch.");
  }
  return parsed;
}
