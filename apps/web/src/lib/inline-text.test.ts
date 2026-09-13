import { expect, test } from "bun:test";
import {
  materializeTextBlocks,
  parseTextBlock,
  textBlockKey,
} from "./inline-text";

test("inline text uses independent exact-base addresses and cannot carry markup operations", async () => {
  const block = parseTextBlock({
    base: {
      origin: "h_V2AE7cudMqACIdoFBJv2",
      sha256: "a".repeat(64),
      version: 1,
    },
    original: "Before",
    path: "body>main:nth-child(1)>p:nth-child(2)",
    schema: "bitplan-text/1",
    text: "After",
  });
  expect(await textBlockKey(block)).toBe(
    await textBlockKey({ ...block, text: "Concurrent change" })
  );
  expect(await textBlockKey(block)).not.toBe(
    await textBlockKey({
      ...block,
      path: "body>main:nth-child(1)>p:nth-child(3)",
    })
  );
  expect(await textBlockKey(block)).not.toBe(
    await textBlockKey({
      ...block,
      base: { ...block.base, sha256: "b".repeat(64) },
    })
  );
  expect(() => parseTextBlock({ ...block, path: "body,script" })).toThrow();
  expect(() =>
    parseTextBlock({ ...block, text: "x".repeat(16_001) })
  ).toThrow();
  expect(
    parseTextBlock({ ...block, text: "<script>literal text</script>" }).text
  ).toBe("<script>literal text</script>");
});

test("export materializes only eligible text leaves, never script or interactive content", () => {
  const base = {
    origin: "h_V2AE7cudMqACIdoFBJv2",
    sha256: "a".repeat(64),
    version: 1,
  };
  const paragraph = {
    children: [],
    closest: () => null,
    matches: () => true,
    textContent: "Original",
  };
  const script = {
    children: [],
    closest: () => ({}),
    matches: () => false,
    textContent: "Original",
  };
  const buttonText = {
    children: [],
    closest: () => ({}),
    matches: () => true,
    textContent: "Original",
  };
  const elements = [paragraph, script, buttonText];
  const previous = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
  Object.defineProperty(globalThis, "DOMParser", {
    configurable: true,
    value: class {
      parseFromString() {
        return {
          doctype: null,
          documentElement: {
            get outerHTML() {
              return elements.map((element) => element.textContent).join("|");
            },
          },
          querySelector(path: string) {
            return elements[Number(path.at(-2)) - 1];
          },
        };
      }
    },
  });
  try {
    const blocks = elements.map((_, index) =>
      parseTextBlock({
        base,
        original: "Original",
        path: `body>p:nth-child(${index + 1})`,
        schema: "bitplan-text/1",
        text: "Updated",
      })
    );
    expect(materializeTextBlocks("base", blocks, base)).toBe(
      "Updated|Original|Original"
    );
    expect(
      materializeTextBlocks("base", blocks, { ...base, sha256: "b".repeat(64) })
    ).toBe("base");
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "DOMParser", previous);
    } else {
      Reflect.deleteProperty(globalThis, "DOMParser");
    }
  }
});
