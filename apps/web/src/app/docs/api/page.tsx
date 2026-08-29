import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  description:
    "BitPlan API v1 versioning, deprecation, and Sunset policy for the public read surface.",
  title: "BitPlan API",
};

export default function ApiPolicyPage() {
  return (
    <>
      <h1>BitPlan API</h1>
      <p>
        The public read surface is API v1 at <code>/api/v1</code>. The OpenAPI
        document is at <a href="/openapi.json">/openapi.json</a>. Publishing and
        decrypting stay in the npm CLI{" "}
        <a href="https://www.npmjs.com/package/bitplan">bitplan</a>, not this
        HTTP API.
      </p>
      <h2>Versioning</h2>
      <p>
        Breaking changes increment the URL path from <code>/api/v1</code> to{" "}
        <code>/api/v2</code>. Additive fields and new operations can land in v1.
        Machine-readable policy is at{" "}
        <a href="/api/v1/version">/api/v1/version</a>.
      </p>
      <h3>Compatibility</h3>
      <p>
        <code>GET /ordfs/content/{"{pointer}"}</code> remains the same envelope
        bytes as <code>GET /api/v1/content/{"{pointer}"}</code>.
      </p>
      <h2>Deprecation</h2>
      <p>
        Deprecated operations send a <code>Deprecation</code> header (RFC 9745).
        Nothing is deprecated today.
      </p>
      <h3>Sunset</h3>
      <p>
        When an operation is removed, responses include a <code>Sunset</code>{" "}
        header at least 90 days before the removal date. That window is the
        notice agents can rely on.
      </p>
      <p>
        Envelope reads: <Link href="/docs/envelope">envelope spec</Link>. CLI:{" "}
        <Link href="/docs/cli-setup">BitPlan CLI</Link>.
      </p>
    </>
  );
}
