import { describe, expect, test } from "bun:test";

import { jsonApiError, jsonNotFound } from "./api-error";

describe("API errors", () => {
  test("JSON errors include code, message, and hint", async () => {
    const response = jsonApiError(
      400,
      "invalid-pointer",
      "Pointer must be txid_vout:seq.",
      "Example: /ordfs/content/<txid>_0:-1"
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({
      code: "invalid-pointer",
      error: "invalid-pointer",
      message: "Pointer must be txid_vout:seq.",
    });
  });

  test("unknown machine-readable paths return problem+json 404", async () => {
    const response = jsonNotFound("/unknown-resource");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json"
    );
    const body = await response.json();
    expect(body).toMatchObject({
      code: "not-found",
      instance: "/unknown-resource",
      status: 404,
    });
    expect(body.hint).toContain("/llms.txt");
  });
});
