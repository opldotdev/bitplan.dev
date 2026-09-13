import { expect, test } from "bun:test";
import { annotationShortcut } from "./annotation-shortcut";

test("delete and undo do not hijack typing, composition, repeat or redo", () => {
  const key = {
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    isTrusted: true,
    key: "Delete",
    metaKey: false,
    repeat: false,
    shiftKey: false,
  };
  expect(annotationShortcut(key, false)).toBe("remove");
  expect(annotationShortcut(key, true)).toBeNull();
  expect(annotationShortcut({ ...key, isTrusted: false }, false)).toBeNull();
  expect(annotationShortcut({ ...key, isComposing: true }, false)).toBeNull();
  expect(annotationShortcut({ ...key, repeat: true }, false)).toBeNull();
  expect(annotationShortcut({ ...key, key: "z", metaKey: true }, false)).toBe(
    "undo"
  );
  expect(annotationShortcut({ ...key, ctrlKey: true, key: "z" }, false)).toBe(
    "undo"
  );
  expect(
    annotationShortcut(
      { ...key, key: "z", metaKey: true, shiftKey: true },
      false
    )
  ).toBeNull();
});
