import { describe, expect, test } from "bun:test";

import { jsonApiError, jsonNotFound } from "./api-error";

describe("API errors", () => {
  test("JSON errors include code, message, hint, and rate-limit headers", async () => {
    const response = jsonApiError(
      400,
      "invalid-pointer",
      "Pointer must be txid_vout:seq.",
      "Example: /ordfs/content/<txid>_0:-1"
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("ratelimit-policy")).toBe("120;w=60");
    expect(await response.json()).toMatchObject({
      code: "invalid-pointer",
      error: "invalid-pointer",
      message: "Pointer must be txid_vout:seq.",
    });
  });

  test("unknown API paths return problem+json 404", async () => {
    const response = jsonNotFound("/api/v1/orank-probe-test");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json"
    );
    const body = await response.json();
    expect(body).toMatchObject({
      code: "not-found",
      instance: "/api/v1/orank-probe-test",
      status: 404,
    });
    expect(body.hint).toContain("/openapi.json");
  });
});
