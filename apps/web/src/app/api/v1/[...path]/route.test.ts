import { describe, expect, test } from "bun:test";

import { GET } from "./route";

describe("API v1 catch-all", () => {
  test("unknown v1 paths return JSON 404", async () => {
    const response = GET(
      new Request("https://bitplan.dev/api/v1/orank-probe-test")
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json"
    );
    expect(await response.json()).toMatchObject({
      code: "not-found",
      instance: "/api/v1/orank-probe-test",
    });
  });
});
