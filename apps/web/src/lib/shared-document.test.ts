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
  const renamed = await sharedDocument(base, draft.html, "  Master Plan  ");
  expect((await parseSharedDocument(renamed)).title).toBe("Master Plan");
  expect(renamed.sha256).toBe(draft.sha256);
  expect(renamed.html).toBe(draft.html);
  const titleOnly = await sharedDocument(base, undefined, "Master Plan");
  expect(await parseSharedDocument(titleOnly)).toEqual(titleOnly);
  expect(titleOnly.html).toBeUndefined();
  expect(titleOnly.sha256).toBe(base.sha256);
  await expect(sharedDocument(base, undefined)).rejects.toThrow();
  await expect(parseSharedDocument({ ...draft, title: 123 })).rejects.toThrow();
  await expect(sharedDocument(base, draft.html, " ")).rejects.toThrow();
  await expect(
    sharedDocument(base, draft.html, "a".repeat(161))
  ).rejects.toThrow();
  await expect(
    parseSharedDocument({ ...draft, html: "Changed" })
  ).rejects.toThrow("hash mismatch");
  await expect(sharedDocument(base, " ")).rejects.toThrow();
  await expect(sharedDocument(base, "a".repeat(180_001))).rejects.toThrow();
  await expect(
    sharedDocument({ ...base, outpoint: base.origin }, "Hello")
  ).rejects.toThrow();
});
