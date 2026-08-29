import { describe, expect, test } from "bun:test";

import { GET as getApiCatalog } from "@/app/.well-known/api-catalog/route";

import { apiIndex, OPENAPI_SPEC } from "./openapi";

describe("OpenAPI", () => {
  test("versions the read API at /api/v1 with JSON schemas", () => {
    expect(OPENAPI_SPEC.info.version).toBe("1.0.0");
    expect(OPENAPI_SPEC.info.description).toContain("/api/v1");
    expect(OPENAPI_SPEC.info.description).toContain("Sunset");
    expect(OPENAPI_SPEC.paths["/api/v1"].get.operationId).toBe("getApiIndex");
    expect(
      OPENAPI_SPEC.paths["/api/v1/content/{pointer}"].get.operationId
    ).toBe("getEnvelopeV1");
    expect(
      OPENAPI_SPEC.paths["/api/v1/content/{pointer}"].get.responses["400"]
        .content["application/json"].schema
    ).toEqual({ $ref: "#/components/schemas/Error" });
    expect(
      OPENAPI_SPEC.paths["/openapi.json"].get.responses["200"].content[
        "application/json"
      ]
    ).toBeDefined();
    expect(OPENAPI_SPEC.externalDocs.url).toContain(
      "npmjs.com/package/bitplan"
    );
  });

  test("index names the npm CLI", () => {
    expect(apiIndex().cli).toBe("https://www.npmjs.com/package/bitplan");
    expect(apiIndex().version).toBe("1.0.0");
  });

  test("RFC 9727 catalog points at OpenAPI", async () => {
    const response = getApiCatalog();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.linkset[0]["service-desc"][0].href).toBe(
      "https://bitplan.dev/openapi.json"
    );
  });
});
