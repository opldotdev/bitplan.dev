import { describe, expect, test } from "bun:test";

import {
  isApiPath,
  isDocumentPath,
  prefers,
  wantsJsonNotFound,
  wantsMarkdownNotFound,
} from "./agent-accept";

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

  test("JSON Accept prefers a JSON 404", () => {
    expect(wantsJsonNotFound("application/json")).toBe(true);
    expect(wantsJsonNotFound("application/problem+json")).toBe(true);
    expect(
      wantsJsonNotFound(
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      )
    ).toBe(false);
  });

  test("API and OrdFS paths skip document content negotiation", () => {
    expect(isApiPath("/ordfs/content/nope")).toBe(true);
    expect(isApiPath("/api/sponsors/silver-1/image")).toBe(true);
    expect(isApiPath("/docs")).toBe(false);
  });
});
