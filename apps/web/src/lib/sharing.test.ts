import { describe, expect, test } from "bun:test";

import { buildShareInstructions, parseIdentityKeys } from "./sharing";

const READER_A =
  "02C6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5";
const READER_B =
  "03F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9";

describe("sharing instructions", () => {
  test("normalizes, deduplicates, and reports malformed identity keys", () => {
    expect(
      parseIdentityKeys(
        `${READER_A}, ${READER_A.toLowerCase()}\nnope ${READER_B}`
      )
    ).toEqual({
      invalid: ["nope"],
      valid: [READER_A.toLowerCase(), READER_B.toLowerCase()],
    });
  });

  test("builds explicit additive CLI instructions", () => {
    const instructions = buildShareInstructions("origin_0", [
      READER_A.toLowerCase(),
      READER_B.toLowerCase(),
    ]);

    expect(instructions).toContain("npx bitplan upload ./plan.html");
    expect(instructions).toContain("--draft origin_0");
    expect(instructions.match(/--share-with/g)).toHaveLength(2);
    expect(instructions).toContain("Do not use --private");
    expect(instructions).toContain("BRC-100 wallet");
  });

  test("rejects compressed-looking values that are not canonical curve points", () => {
    expect(parseIdentityKeys(`02${"f".repeat(64)}`)).toEqual({
      invalid: [`02${"f".repeat(64)}`],
      valid: [],
    });
  });
});
