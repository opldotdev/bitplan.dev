import { describe, expect, test } from "bun:test";

import { SITE_GRAPH } from "./site-json-ld";

describe("site JSON-LD", () => {
  test("Organization includes url, sameAs, logo, and description", () => {
    const org = SITE_GRAPH["@graph"].find(
      (node) => node["@type"] === "Organization"
    );
    expect(org).toMatchObject({
      logo: "https://bitplan.dev/icon.png",
      name: "BitPlan",
      url: "https://bitplan.dev",
    });
    expect(org?.sameAs).toContain("https://www.npmjs.com/package/bitplan");
    expect(org?.description).toContain("bitplan");
  });

  test("SoftwareApplication points at the npm CLI", () => {
    const app = SITE_GRAPH["@graph"].find(
      (node) => node["@type"] === "SoftwareApplication"
    );
    expect(app).toMatchObject({
      downloadUrl: "https://www.npmjs.com/package/bitplan",
      installUrl: "https://www.npmjs.com/package/bitplan",
      name: "bitplan",
    });
    expect(app?.url).toContain("/docs/cli-setup");
  });
});
