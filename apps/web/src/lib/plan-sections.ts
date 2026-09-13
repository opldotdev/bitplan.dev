import type { AnnotationAnchor } from "./annotations";
import { type DocumentTarget, sameDocumentTarget } from "./annotations";
import type { TextBlock } from "./inline-text";

/** Stable base-document paths, matching the inline editor's editable leaves. */
export function planPassages(
  html: string,
  blocks: (TextBlock & { revision: number })[],
  base: DocumentTarget
) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [
    ...doc.querySelectorAll(
      "h1,h2,h3,h4,h5,h6,p,li,span,strong,em,b,i,code,td,th,dt,dd,blockquote"
    ),
  ]
    .filter(
      (element) =>
        !(
          element.children.length ||
          element.closest(
            "a,button,input,textarea,select,[contenteditable],script,style,svg"
          )
        )
    )
    .flatMap((element) => {
      const original = element.textContent ?? "";
      if (!original.trim() || original.length > 16_000) {
        return [];
      }
      const parts: string[] = [];
      let node: Element | null = element;
      while (node && node !== doc.body) {
        const parent: Element | null = node.parentElement;
        if (!parent) {
          return [];
        }
        parts.unshift(
          `${node.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(node) + 1})`
        );
        node = parent;
      }
      if (parts.length > 64) {
        return [];
      }
      const path = `body>${parts.join(">")}`;
      const current = blocks.find(
        (block) => block.path === path && sameDocumentTarget(block.base, base)
      );
      if (current?.deleted) {
        return [];
      }
      return [
        {
          original,
          path,
          revision: current?.revision ?? 0,
          text: current?.text ?? original,
        },
      ];
    });
}

/** Parse inert document content, never execute it or accept a caller-supplied selector. */
export function planSections(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const elements = [...doc.querySelectorAll("section,article")];
  if (!elements.length) {
    elements.push(...doc.querySelectorAll("main"));
  }
  return elements.map((element) => {
    const parts: string[] = [];
    let node: Element | null = element;
    while (node && node !== doc.body) {
      const parent: Element | null = node.parentElement;
      if (!parent) {
        break;
      }
      parts.unshift(
        `${node.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(node) + 1})`
      );
      node = parent;
    }
    const domPath = `body>${parts.join(">")}`;
    const copy = element.cloneNode(true) as Element;
    for (const hidden of copy.querySelectorAll("script,style,template")) {
      hidden.remove();
    }
    return {
      anchor: { domPath, point: { x: 0.5, y: 0.1 } } as AnnotationAnchor,
      domPath,
      html: copy.outerHTML,
      text: copy.textContent?.trim() ?? "",
      title:
        copy.querySelector("h1,h2,h3,h4")?.textContent?.trim() || "Section",
    };
  });
}
