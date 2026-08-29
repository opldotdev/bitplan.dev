import { describe, expect, test } from "bun:test";

import { LLMS_TXT, markdownForPath, markdownNotFound } from "./agent-pages";

describe("agent pages", () => {
  test("home and docs have markdown", () => {
    expect(markdownForPath("/")).toContain("npx bitplan");
    expect(markdownForPath("/docs")).toContain("Docs");
    expect(markdownForPath("/docs/")).toContain("Docs");
  });

  test("unknown paths have no markdown page", () => {
    expect(markdownForPath("/nope")).toBeNull();
  });

  test("llms.txt names the CLI and when to use BitPlan", () => {
    expect(LLMS_TXT).toContain("When to use this");
    expect(LLMS_TXT).toContain("npx bitplan");
    expect(LLMS_TXT).toContain("https://www.npmjs.com/package/bitplan");
    expect(LLMS_TXT).toContain("/api/v1/content/");
  });

  test("not-found markdown points at docs, sitemap, and llms.txt", () => {
    expect(markdownNotFound()).toContain("/docs");
    expect(markdownNotFound()).toContain("/sitemap.xml");
    expect(markdownNotFound()).toContain("/llms.txt");
    expect(markdownNotFound()).toContain("/openapi.json");
  });
});
