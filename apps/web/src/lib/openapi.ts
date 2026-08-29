import { SITE_URL } from "@/lib/site";

const ERROR_SCHEMA = {
  additionalProperties: false,
  properties: {
    code: { type: "string" },
    error: { type: "string" },
    hint: { type: "string" },
    message: { type: "string" },
    status: { type: "integer" },
  },
  required: ["code", "error", "message", "status"],
  type: "object",
} as const;

const PROBLEM_SCHEMA = {
  additionalProperties: false,
  properties: {
    code: { type: "string" },
    detail: { type: "string" },
    error: { type: "string" },
    hint: { type: "string" },
    instance: { type: "string" },
    message: { type: "string" },
    status: { type: "integer" },
    title: { type: "string" },
    type: { format: "uri", type: "string" },
  },
  required: ["type", "title", "status", "detail", "code"],
  type: "object",
} as const;

const API_INDEX_SCHEMA = {
  additionalProperties: false,
  properties: {
    cli: { format: "uri", type: "string" },
    docs: { format: "uri", type: "string" },
    envelope: {
      description:
        "GET an origin pointer, for example /api/v1/content/{txid}_0:-1",
      type: "string",
    },
    llms: { format: "uri", type: "string" },
    openapi: { format: "uri", type: "string" },
    version: { type: "string" },
  },
  required: ["version", "openapi", "envelope", "cli", "docs"],
  type: "object",
} as const;

const JSON_ERROR = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
    "application/problem+json": {
      schema: { $ref: "#/components/schemas/Problem" },
    },
  },
} as const;

const POINTER = {
  description:
    "txid_vout:seq. Sequence -1 is the tip, 0 is genesis, N is an absolute sequence.",
  in: "path",
  name: "pointer",
  required: true,
  schema: { type: "string" },
} as const;

const ENVELOPE_GET = {
  description:
    "Fetch a BitPlan envelope from 1Sat. Pointer is origin or outpoint plus sequence, for example txid_0:-1 for the tip. Publishing and decrypting happen in the user's BRC-100 wallet via the npm CLI bitplan, not this HTTP API.",
  operationId: "getEnvelope",
  parameters: [POINTER],
  responses: {
    "200": {
      content: {
        "application/x-bitplan": {
          schema: { format: "binary", type: "string" },
        },
      },
      description: "Validated BitPlan envelope bytes",
    },
    "400": { ...JSON_ERROR, description: "Invalid pointer" },
    "404": { ...JSON_ERROR, description: "No inscription at that pointer" },
    "502": { ...JSON_ERROR, description: "Upstream content could not be used" },
  },
  summary: "Read a draft envelope",
} as const;

export const OPENAPI_SPEC = {
  components: {
    schemas: {
      ApiIndex: API_INDEX_SCHEMA,
      Error: ERROR_SCHEMA,
      Problem: PROBLEM_SCHEMA,
    },
  },
  externalDocs: {
    description: "npm CLI: npx bitplan",
    url: "https://www.npmjs.com/package/bitplan",
  },
  info: {
    description:
      "Public read surface for BitPlan. This is API v1 at /api/v1. Breaking changes increment the URL path to /api/v2. Deprecated operations will send a Deprecation header (RFC 9745) and a Sunset header at least 90 days out. Responses include RateLimit and RateLimit-Policy (120 requests per 60-second window). Unknown /api/v1 and /ordfs paths return application/problem+json. Publishing and decrypting happen in the user's BRC-100 wallet via the npm package bitplan, not this HTTP API.",
    title: "BitPlan",
    version: "1.0.0",
  },
  openapi: "3.1.0",
  paths: {
    "/api/v1": {
      get: {
        description:
          "Machine-readable index of the v1 read API, the OpenAPI document, and the npm CLI.",
        operationId: "getApiIndex",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiIndex" },
              },
            },
            description: "API index",
          },
        },
        summary: "API v1 index",
      },
    },
    "/api/v1/content/{pointer}": {
      get: { ...ENVELOPE_GET, operationId: "getEnvelopeV1" },
    },
    "/llms.txt": {
      get: {
        description:
          "Agent instructions: when to use BitPlan and how to run the npm CLI bitplan.",
        operationId: "getLlmsTxt",
        responses: {
          "200": {
            content: {
              "text/markdown": { schema: { type: "string" } },
            },
            description: "Markdown instructions",
          },
        },
        summary: "Agent instructions",
      },
    },
    "/openapi.json": {
      get: {
        description: "OpenAPI 3.1 description of the public read API.",
        operationId: "getOpenApi",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
            description: "OpenAPI document",
          },
        },
        summary: "OpenAPI document",
      },
    },
    "/ordfs/content/{pointer}": {
      get: ENVELOPE_GET,
    },
    "/sitemap.xml": {
      get: {
        description: "Indexable public URLs.",
        operationId: "getSitemap",
        responses: {
          "200": {
            content: { "application/xml": { schema: { type: "string" } } },
            description: "XML sitemap",
          },
        },
        summary: "Sitemap",
      },
    },
  },
  servers: [
    { description: "BitPlan v1", url: `${SITE_URL}/api/v1` },
    { description: "Site origin", url: SITE_URL },
  ],
};

export function apiIndex() {
  return {
    cli: "https://www.npmjs.com/package/bitplan",
    docs: `${SITE_URL}/docs/cli-setup`,
    envelope: `${SITE_URL}/api/v1/content/{pointer}`,
    llms: `${SITE_URL}/llms.txt`,
    openapi: `${SITE_URL}/openapi.json`,
    version: "1.0.0",
  };
}
