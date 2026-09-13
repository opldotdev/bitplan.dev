import { expect, test } from "bun:test";
import { planAuthority, publicationPrompt } from "./plan-authority";

// Public secp256k1 test vectors, unrelated to any user's wallet.
const desktop =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const yours =
  "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const hosted = "h_abcdefghijklmnopqrst";
const chain = `${"a".repeat(64)}_0`;

test("publisher identity never substitutes for latest coin or hosted write authority", () => {
  expect(planAuthority(hosted, desktop, desktop, false)).toBe("publisher");
  expect(planAuthority(hosted, yours, desktop, true)).toBe("connected");
  expect(planAuthority(chain, desktop, desktop, false)).toBe("connected");
  expect(planAuthority(chain, yours, desktop, true)).toBe("owner");
  expect(planAuthority(chain, "invalid", desktop, true)).toBe("connected");
});

test("publication handoff preserves live layers and never copies credentials", () => {
  expect(publicationPrompt(hosted, false)).toContain(
    "do not inscribe or spend BSV"
  );
  expect(publicationPrompt(chain, true)).toContain("approval before signing");
  expect(publicationPrompt(hosted, true)).toContain(
    "saved hosted-update authority"
  );
  expect(() => publicationPrompt(`${hosted}#k=secret`, false)).toThrow();
});
