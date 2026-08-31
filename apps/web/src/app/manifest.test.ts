import { describe, expect, test } from "bun:test";

import manifest from "./manifest.json";

describe("web app manifest", () => {
  test("declares only the wallet access BitPlan can know in advance", () => {
    expect(manifest.metanet).toEqual({
      counterpartyPermissions: {
        description: "Let you open a plan shared by another wallet.",
        protocols: [
          {
            description: "Decrypt a BitPlan plan shared with you.",
            protocolName: "bitplan",
          },
        ],
      },
      groupPermissions: {
        basketAccess: [
          {
            basket: "1sat",
            description: "Find your BitPlan plan coins.",
          },
        ],
        description: "Let BitPlan find the plans held in your wallet.",
      },
      schemaVersion: 1,
    });
    expect(manifest.metanet.groupPermissions).not.toHaveProperty(
      "spendingAuthorization"
    );
    expect(manifest.metanet.groupPermissions).not.toHaveProperty(
      "protocolPermissions"
    );
  });
});
