import { expect, test } from "bun:test";
import { annotationLink } from "./annotation-link";

test("link annotations allow complete web URLs without turning prose or credentials into links", () => {
  expect(annotationLink(" https://example.com/reference?q=plan#section ")).toBe(
    "https://example.com/reference?q=plan#section"
  );
  for (const text of [
    "javascript:alert(1)",
    "data:text/html,test",
    "/docs",
    "See https://example.com",
    "https://user:password@example.com",
    "https://",
    "https://example.com/a b",
  ]) {
    expect(annotationLink(text)).toBeNull();
  }
});
