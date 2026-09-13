import {
  type Annotation,
  type DocumentTarget,
  sameDocumentTarget,
} from "./annotations";
import { materializeTextBlocks, type TextBlock } from "./inline-text";
import { withRenderPolicy } from "./render-policy";

function appendNoteContent(
  doc: Document,
  entry: HTMLElement,
  note: Annotation
) {
  const content = doc.createElement("p");
  content.style.whiteSpace = "pre-wrap";
  if (note.content.type === "image") {
    const image = doc.createElement("img");
    image.src = note.content.dataUrl;
    image.alt = note.content.alt;
    image.style.cssText = "max-width:100%;max-height:600px;object-fit:contain";
    entry.append(image);
  } else if (note.content.type === "html") {
    const widget = new DOMParser().parseFromString(
      note.content.html,
      "text/html"
    );
    for (const node of widget.querySelectorAll("script,style")) {
      node.remove();
    }
    content.textContent = `HTML widget (text): ${widget.body.textContent ?? ""}`;
  } else if (note.content.type === "text") {
    content.textContent = note.content.text;
  } else {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("width", "240");
    for (const stroke of note.content.strokes) {
      const line = doc.createElementNS(svg.namespaceURI, "polyline");
      line.setAttribute(
        "points",
        stroke.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")
      );
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "black");
      svg.append(line);
    }
    entry.append(svg);
  }
  entry.append(content);
}

/** A local print snapshot. Never sends decrypted content to a PDF service. */
export function printablePlanHtml(
  snapshot: {
    html: string;
    title: string;
    target: DocumentTarget;
    blocks: readonly TextBlock[];
    annotations: readonly Annotation[];
    profiles: Record<string, { name: string }>;
  },
  includeAnnotations: boolean
) {
  const doc = new DOMParser().parseFromString(
    materializeTextBlocks(snapshot.html, snapshot.blocks, snapshot.target),
    "text/html"
  );
  doc.title = snapshot.title;
  for (const node of doc.querySelectorAll("script,iframe,object,embed,base")) {
    node.remove();
  }
  if (includeAnnotations) {
    const appendix = doc.createElement("section");
    appendix.style.cssText =
      "break-before:page;padding:24px;background:white;color:black;font:14px/1.6 system-ui";
    const heading = doc.createElement("h1");
    heading.textContent = "Annotations";
    appendix.append(heading);
    for (const note of snapshot.annotations.filter(
      (item) =>
        sameDocumentTarget(item.target, snapshot.target) &&
        item.status === "open"
    )) {
      const entry = doc.createElement("article");
      entry.style.cssText =
        "break-inside:avoid;border-bottom:1px solid #ccc;padding:16px 0";
      const author = doc.createElement("p");
      author.textContent = `${snapshot.profiles[note.participantId]?.name ?? "Collaborator"} · version ${note.target.version} · ${note.id}${note.replyTo ? ` · reply to ${note.replyTo}` : ""}`;
      entry.append(author);
      appendNoteContent(doc, entry, note);
      appendix.append(entry);
    }
    doc.body.append(appendix);
  }
  return withRenderPolicy(doc.documentElement.outerHTML);
}

export async function printPlan(
  snapshot: Parameters<typeof printablePlanHtml>[0],
  includeAnnotations: boolean
) {
  const frame = document.createElement("iframe");
  frame.title = "PDF print snapshot";
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1000px;height:1000px;border:0";
  const loaded = new Promise<void>((resolve) => {
    frame.onload = () => resolve();
  });
  frame.srcdoc = printablePlanHtml(snapshot, includeAnnotations);
  document.body.append(frame);
  await loaded;
  const printWindow = frame.contentWindow;
  if (!printWindow) {
    frame.remove();
    throw new Error("Print preview unavailable.");
  }
  await printWindow.document.fonts.ready;
  printWindow.addEventListener("afterprint", () => frame.remove(), {
    once: true,
  });
  try {
    printWindow.print();
  } catch (error) {
    frame.remove();
    throw error;
  }
}
