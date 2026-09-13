import {
  type DocumentTarget,
  parseDocumentTarget,
  sameDocumentTarget,
} from "./annotations";

const PATH = /^body(?:>[a-z][a-z0-9-]*:nth-child\([1-9][0-9]{0,5}\)){1,64}$/;
export interface TextBlock {
  base: DocumentTarget;
  deleted?: boolean;
  original: string;
  path: string;
  schema: "bitplan-text/1";
  text: string;
}

/** Plain text only: a block update cannot introduce markup or executable attributes. */
export function parseTextBlock(value: unknown): TextBlock {
  if (
    !value ||
    typeof value !== "object" ||
    !("schema" in value) ||
    value.schema !== "bitplan-text/1" ||
    !("base" in value) ||
    !("path" in value) ||
    typeof value.path !== "string" ||
    value.path.length > 2048 ||
    !PATH.test(value.path) ||
    !("original" in value) ||
    typeof value.original !== "string" ||
    value.original.length > 16_000 ||
    !("text" in value) ||
    typeof value.text !== "string" ||
    value.text.length > 16_000 ||
    ("deleted" in value && typeof value.deleted !== "boolean")
  ) {
    throw new Error("Invalid inline text update.");
  }
  return {
    base: parseDocumentTarget(value.base),
    ...("deleted" in value && value.deleted === true ? { deleted: true } : {}),
    original: value.original,
    path: value.path,
    schema: "bitplan-text/1",
    text: value.text,
  };
}

export async function textBlockKey(block: TextBlock): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify([block.base, block.path])
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `text_${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Materialize the text overlay for export; DOMParser does not execute plan scripts. */
export function materializeTextBlocks(
  html: string,
  blocks: readonly TextBlock[],
  base: DocumentTarget
): string {
  const active = blocks.filter((block) => sameDocumentTarget(block.base, base));
  if (!active.length) {
    return html;
  }
  const document = new DOMParser().parseFromString(html, "text/html");
  // Resolve every original path before removing siblings changes nth-child addresses.
  const targets = active.map((block) => ({
    block,
    element: document.querySelector(block.path),
  }));
  for (const { block, element } of targets) {
    if (
      element?.matches(
        "h1,h2,h3,h4,h5,h6,p,li,span,strong,em,b,i,code,td,th,dt,dd,blockquote"
      ) &&
      !element.closest(
        "a,button,input,textarea,select,[contenteditable],script,style,svg"
      ) &&
      element.children.length === 0 &&
      element.textContent === block.original
    ) {
      if (block.deleted) {
        element.remove();
      } else {
        element.textContent = block.text;
      }
    }
  }
  return `${document.doctype ? "<!doctype html>" : ""}${document.documentElement.outerHTML}`;
}
