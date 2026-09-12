import { describe, expect, test } from "bun:test";

import {
  latestRevision,
  settleChangePage,
  settleRows,
} from "./collaboration-change-page";

describe("settleChangePage", () => {
  test("keeps valid rows and advances past a poisoned row", async () => {
    const page = await settleChangePage(
      [
        { sequence: 1, value: "first" },
        { sequence: 2, value: "poison" },
        { sequence: 3, value: "last" },
      ],
      (row) => {
        if (row.value === "poison") {
          return Promise.reject(new Error("invalid ciphertext"));
        }
        return Promise.resolve(row.value);
      }
    );

    expect(page.values).toEqual(["first", "last"]);
    expect(page.failures).toHaveLength(1);
    expect(page.lastSequence).toBe(3);

    const later = await settleChangePage(
      [{ sequence: 4, value: "later" }],
      (row) => Promise.resolve(row.value)
    );
    expect(later.values).toEqual(["later"]);
    expect(later.lastSequence).toBe(4);
  });
});

describe("settleRows", () => {
  test("keeps valid participant rows when one row is poisoned", async () => {
    const rows = await settleRows(["alice", "poison", "bob"], (value) =>
      value === "poison"
        ? Promise.reject(new Error("invalid ciphertext"))
        : Promise.resolve(value.toUpperCase())
    );

    expect(rows.values).toEqual(["ALICE", "BOB"]);
    expect(rows.failures).toHaveLength(1);
  });
});

describe("latestRevision", () => {
  test("retains a rejected document row's server revision for recovery", () => {
    const rows = [
      { kind: "annotation", revision: 9 },
      { kind: "document", revision: 2 },
      { kind: "document", revision: 4 },
    ];

    expect(latestRevision(rows, (row) => row.kind === "document")).toBe(4);
  });
});
