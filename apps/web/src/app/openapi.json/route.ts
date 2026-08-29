import { SITE_URL } from "@/lib/site";

const SPEC = {
  info: {
    description:
      "Public read surface for BitPlan. Publishing and decrypting happen in the user's BRC-100 wallet via the npm CLI `bitplan`, not this HTTP API.",
    title: "BitPlan",
    version: "1.0.0",
  },
  openapi: "3.1.0",
  paths: {
    "/llms.txt": {
      get: {
        description:
          "Agent instructions: when to use BitPlan and how to run the CLI.",
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
    "/ordfs/content/{pointer}": {
      get: {
        description:
          "Fetch a BitPlan envelope from 1Sat. Pointer is origin or outpoint plus sequence, for example txid_0:-1 for the tip.",
        operationId: "getEnvelope",
        parameters: [
          {
            description:
              "txid_vout:seq. Sequence -1 is the tip, 0 is genesis, N is an absolute sequence.",
            in: "path",
            name: "pointer",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/x-bitplan": {
                schema: { format: "binary", type: "string" },
              },
            },
            description: "Validated BitPlan envelope bytes",
          },
          "400": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
            description: "Invalid pointer",
          },
          "404": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
            description: "No inscription at that pointer",
          },
        },
        summary: "Read a draft envelope",
      },
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
  servers: [{ url: SITE_URL }],
} as const;

const COMPONENTS = {
  schemas: {
    Error: {
      additionalProperties: false,
      properties: {
        error: { type: "string" },
        hint: { type: "string" },
        message: { type: "string" },
      },
      required: ["error", "message"],
      type: "object",
    },
  },
};

export function GET() {
  return Response.json(
    { ...SPEC, components: COMPONENTS },
    {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": "application/json; charset=utf-8",
      },
    }
  );
}
