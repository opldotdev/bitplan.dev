import {
  type DocumentTarget,
  parseDocumentTarget,
  sameDocumentTarget,
} from "./annotations";

const PATH = /^body(?:>[a-z][a-z0-9-]*:nth-child\([1-9][0-9]{0,5}\)){1,64}$/;
const AUTHOR_ID = /^[a-zA-Z0-9_-]{1,128}$/;
export interface TextBlock {
  base: DocumentTarget;
  deleted?: boolean;
  original: string;
  path: string;
  schema: "bitplan-text/1";
  text: string;
}

/** Attribution is bound by the room's authenticated session, not yet a wallet signature. */
export interface AuthorTextEdit extends TextBlock {
  participantId: string;
  revision: number;
  roomId: string;
  sequence: number;
  sessionId: string;
}

export function parseAuthorTextEdit(value: unknown): AuthorTextEdit {
  const block = parseTextBlock(value);
  const raw = value as Record<string, unknown>;
  for (const field of ["participantId", "sessionId", "roomId"] as const) {
    if (typeof raw[field] !== "string" || !AUTHOR_ID.test(raw[field])) {
      throw new Error("Invalid text-edit attribution.");
    }
  }
  for (const field of ["revision", "sequence"] as const) {
    if (!Number.isSafeInteger(raw[field]) || (raw[field] as number) < 1) {
      throw new Error("Invalid text-edit revision.");
    }
  }
  return {
    ...block,
    participantId: raw.participantId as string,
    revision: raw.revision as number,
    roomId: raw.roomId as string,
    sequence: raw.sequence as number,
    sessionId: raw.sessionId as string,
  };
}

export function retainAuthorTextEdit(
  edits: readonly AuthorTextEdit[],
  incoming: AuthorTextEdit
): AuthorTextEdit[] {
  const same = (edit: AuthorTextEdit) =>
    edit.roomId === incoming.roomId &&
    edit.participantId === incoming.participantId &&
    edit.path === incoming.path &&
    sameDocumentTarget(edit.base, incoming.base);
  if (edits.some((edit) => same(edit) && edit.revision >= incoming.revision)) {
    return [...edits];
  }
  return [...edits.filter((edit) => !same(edit)), incoming];
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

/** Restored passages leave the active review, not the stored author history. */
export function activeReviewEdits(
  edits: readonly AuthorTextEdit[],
  latest: readonly TextBlock[]
): AuthorTextEdit[] {
  return edits.filter(
    (edit) =>
      !latest.some(
        (block) =>
          block.path === edit.path &&
          sameDocumentTarget(block.base, edit.base) &&
          !block.deleted &&
          block.text === block.original
      )
  );
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
