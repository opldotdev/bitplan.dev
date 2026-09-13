import type {
  Annotation,
  AnnotationContent,
  DocumentTarget,
} from "./annotations";
import { sameDocumentTarget } from "./annotations";
import type { CollaboratorProfile } from "./collaborator";

export function replyParent(
  id: string | undefined,
  annotations: Annotation[],
  content: AnnotationContent,
  target: DocumentTarget
) {
  if (!id) {
    return;
  }
  const parent = annotations.find((item) => item.id === id);
  if (
    !parent ||
    parent.replyTo ||
    parent.content.type !== "text" ||
    content.type !== "text" ||
    !sameDocumentTarget(parent.target, target)
  ) {
    throw new Error("Reply to a text annotation on the current plan version.");
  }
  return parent;
}

export function annotationReplies(root: Annotation, annotations: Annotation[]) {
  return annotations
    .filter(
      (item) =>
        item.replyTo === root.id &&
        item.content.type === "text" &&
        sameDocumentTarget(item.target, root.target)
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    );
}

/** Handles identify room profiles, not verified wallets or global accounts. */
export function roomHandles(profiles: Record<string, CollaboratorProfile>) {
  const entries = Object.entries(profiles);
  const slug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "person";
  const bases = entries.map(([, profile]) => slug(profile.name));
  return entries.map(([id, profile], index) => ({
    handle: `@${bases[index]}${bases.filter((base) => base === bases[index]).length > 1 ? `-${id}` : ""}`,
    id,
    name: profile.name,
  }));
}

export function mentionParts(
  text: string,
  handles: ReturnType<typeof roomHandles>
) {
  // Match the actual known handles, including disambiguating participant IDs.
  const known = new Map(
    handles.map((handle) => [handle.handle.toLowerCase(), handle])
  );
  return text
    .split(/(?<![\w@])(@[a-z0-9][a-z0-9_-]*)/gi)
    .filter(Boolean)
    .map((value) => ({
      recipient: known.get(value.toLowerCase()),
      text: value,
    }));
}
