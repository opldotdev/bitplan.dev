import { describe, expect, test } from "bun:test";

import { isDocumentPath, prefers, wantsMarkdownNotFound } from "./agent-accept";

describe("agent accept", () => {
  test("browsers prefer HTML over markdown", () => {
    const accept =
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
    expect(prefers(accept, "text/html", "text/markdown")).toBe(true);
    expect(prefers(accept, "text/markdown", "text/html")).toBe(false);
    expect(wantsMarkdownNotFound(accept)).toBe(false);
  });

  test("explicit markdown wins", () => {
    expect(prefers("text/markdown", "text/markdown", "text/html")).toBe(true);
    expect(wantsMarkdownNotFound("text/markdown")).toBe(true);
  });

  test("curl and empty Accept get a markdown 404", () => {
    expect(wantsMarkdownNotFound("")).toBe(true);
    expect(wantsMarkdownNotFound("*/*")).toBe(true);
    expect(wantsMarkdownNotFound("application/json")).toBe(true);
  });

  test("document paths are extensionless", () => {
    expect(isDocumentPath("/some-path-that-does-not-exist")).toBe(true);
    expect(isDocumentPath("/docs/nope")).toBe(true);
    expect(isDocumentPath("/")).toBe(true);
    expect(isDocumentPath("/icon.png")).toBe(false);
    expect(isDocumentPath("/llms.txt")).toBe(false);
  });
});
