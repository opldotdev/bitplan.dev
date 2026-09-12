/** Keep IME confirmation and multiline entry separate from submission. */
export function annotationInputAction(event: {
  key: string;
  shiftKey: boolean;
  repeat: boolean;
  nativeEvent: { isComposing: boolean; keyCode: number };
}): "save" | "cancel" | null {
  if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
    return null;
  }
  if (event.key === "Escape") {
    return "cancel";
  }
  if (event.key === "Enter" && !event.shiftKey && !event.repeat) {
    return "save";
  }
  return null;
}
