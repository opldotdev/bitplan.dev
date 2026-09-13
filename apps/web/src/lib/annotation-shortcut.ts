/** Leave typing, composition, held keys, and modifier shortcuts to the browser. */
export function annotationShortcut(
  event: {
    key: string;
    isTrusted: boolean;
    isComposing: boolean;
    repeat: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  },
  editing: boolean
): "remove" | "undo" | null {
  if (
    !event.isTrusted ||
    event.isComposing ||
    event.repeat ||
    event.altKey ||
    editing
  ) {
    return null;
  }
  if (event.metaKey || event.ctrlKey) {
    return !event.shiftKey && event.key.toLowerCase() === "z" ? "undo" : null;
  }
  return event.key === "Delete" || event.key === "Backspace" ? "remove" : null;
}
