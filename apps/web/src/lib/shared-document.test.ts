import { expect, test } from "bun:test";
import { parseSharedDocument, sharedDocument } from "./shared-document";

test("live HTML stays bound to its hosted base and its exact bytes", async () => {
  const base = {
    origin: "h_V2AE7cudMqACIdoFBJv2",
    sha256: "a".repeat(64),
    version: 1,
  };
  const draft = await sharedDocument(
    base,
    '<h1 id="title">Working together</h1>'
  );
  expect(await parseSharedDocument(draft)).toEqual(draft);
  await expect(
    parseSharedDocument({ ...draft, html: "Changed" })
  ).rejects.toThrow("hash mismatch");
  await expect(sharedDocument(base, " ")).rejects.toThrow();
  await expect(sharedDocument(base, "a".repeat(180_001))).rejects.toThrow();
  await expect(
    sharedDocument({ ...base, outpoint: base.origin }, "Hello")
  ).rejects.toThrow();
});
