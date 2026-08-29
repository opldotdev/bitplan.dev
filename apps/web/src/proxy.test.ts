import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

function request(path: string, accept?: string) {
  return new NextRequest(`https://bitplan.dev${path}`, {
    headers: accept === undefined ? undefined : { accept },
  });
}

describe("proxy", () => {
  test("unknown paths return markdown 404 for curl", async () => {
    const response = proxy(request("/some-path-that-does-not-exist"));
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    const body = await response.text();
    expect(body).toContain("# Not found");
    expect(body).toContain("/sitemap.xml");
    expect(body).toContain("/llms.txt");
    expect(body).toContain("/docs");
  });

  test("unknown paths return markdown 404 for */*", async () => {
    const response = proxy(request("/missing", "*/*"));
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("llms.txt");
  });

  test("browsers still get the HTML app 404", () => {
    const response = proxy(
      request(
        "/missing",
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      )
    );
    expect(response.status).not.toBe(404);
  });

  test("explicit markdown still gets markdown pages", async () => {
    const response = proxy(request("/docs", "text/markdown"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Docs");
  });
});
