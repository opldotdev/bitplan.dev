import { describe, expect, test } from "bun:test";

import { RENDER_POLICY, withRenderPolicy } from "./render-policy";

describe("withRenderPolicy", () => {
  test("places the policy first inside head", () => {
    const out = withRenderPolicy("<html><head><title>x</title></head></html>");
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(
      out.indexOf("<title>")
    );
    expect(out).toContain(RENDER_POLICY);
  });

  test("prepends when there is no head", () => {
    const out = withRenderPolicy("<p>hi</p>");
    expect(out.startsWith("<meta http-equiv")).toBe(true);
  });

  test("denies network and forms while allowing inline scripts", () => {
    expect(RENDER_POLICY).toContain("connect-src 'none'");
    expect(RENDER_POLICY).toContain("form-action 'none'");
    expect(RENDER_POLICY).toContain("script-src 'unsafe-inline'");
  });
});
