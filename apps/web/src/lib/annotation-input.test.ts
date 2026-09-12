import { expect, test } from "bun:test";
import { annotationInputAction } from "./annotation-input";

test("Enter submits, Shift+Enter composes lines, Escape cancels, IME never submits", () => {
  const event = {
    key: "Enter",
    nativeEvent: { isComposing: false, keyCode: 13 },
    repeat: false,
    shiftKey: false,
  };
  expect(annotationInputAction(event)).toBe("save");
  expect(annotationInputAction({ ...event, shiftKey: true })).toBeNull();
  expect(annotationInputAction({ ...event, repeat: true })).toBeNull();
  expect(annotationInputAction({ ...event, key: "Escape" })).toBe("cancel");
  expect(
    annotationInputAction({
      ...event,
      nativeEvent: { isComposing: true, keyCode: 13 },
    })
  ).toBeNull();
  expect(
    annotationInputAction({
      ...event,
      nativeEvent: { isComposing: false, keyCode: 229 },
    })
  ).toBeNull();
});
