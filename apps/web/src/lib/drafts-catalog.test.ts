import { describe, expect, test } from "bun:test";

import type { CatalogEntry } from "./catalog-client";
import {
  applyPlanFilter,
  formatPlanDate,
  mergeCatalogPlans,
  planFilterOptions,
  planRepoLabel,
  planViewerHref,
  sortPlansNewestFirst,
} from "./drafts";

const ORIGIN_A = `${"a".repeat(64)}_0`;
const ORIGIN_B = `${"b".repeat(64)}_2`;

function hostedEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    chainOrigin: null,
    description: "Catalog description",
    id: `h_${"a".repeat(20)}`,
    repoHost: "github.com",
    repoName: "repo",
    repoOrg: "org",
    state: "hosted",
    title: "Hosted plan",
    updatedAt: "2026-09-02T00:00:00.000Z",
    version: 2,
    ...overrides,
  };
}

describe("mergeCatalogPlans", () => {
  test("keeps hosted rows and wallet rows together, newest first", () => {
    const merged = mergeCatalogPlans(
      [hostedEntry({ updatedAt: "2026-09-02T00:00:00.000Z" })],
      [ORIGIN_A]
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]?.source).toBe("hosted");
    expect(merged[1]?.source).toBe("chain");
    expect(merged[1]?.origin).toBe(ORIGIN_A);
  });

  test("dedupes an inscribed entry when the wallet holds its origin", () => {
    const merged = mergeCatalogPlans(
      [
        hostedEntry({
          chainOrigin: ORIGIN_A,
          id: `h_${"b".repeat(20)}`,
          state: "inscribed",
          updatedAt: "2026-09-03T00:00:00.000Z",
        }),
      ],
      [ORIGIN_A]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe("chain");
    expect(merged[0]?.origin).toBe(ORIGIN_A);
    expect(merged[0]?.hostedId).toBeNull();
  });

  test("keeps an inscribed entry the wallet does not hold, as on chain", () => {
    const merged = mergeCatalogPlans(
      [
        hostedEntry({
          chainOrigin: ORIGIN_B,
          id: `h_${"c".repeat(20)}`,
          state: "inscribed",
          updatedAt: "2026-09-03T00:00:00.000Z",
        }),
      ],
      [ORIGIN_A]
    );
    expect(merged).toHaveLength(2);
    const inscribed = merged.find(
      (row) => row.hostedId === `h_${"c".repeat(20)}`
    );
    expect(inscribed?.source).toBe("chain");
    expect(inscribed?.origin).toBe(ORIGIN_B);
    expect(planViewerHref(inscribed ?? { origin: "" })).toBe(`/d/${ORIGIN_B}`);
  });

  test("hosted rows link to /d/<h_id>", () => {
    const [row] = mergeCatalogPlans([hostedEntry()], []);
    expect(planViewerHref(row ?? { origin: "" })).toBe(
      `/d/h_${"a".repeat(20)}`
    );
  });

  test("sorts newest first with undated rows last", () => {
    const rows = sortPlansNewestFirst([
      ...mergeCatalogPlans([], [ORIGIN_A]),
      ...mergeCatalogPlans(
        [
          hostedEntry({
            id: `h_${"d".repeat(20)}`,
            updatedAt: "2026-08-01T00:00:00.000Z",
          }),
          hostedEntry({
            id: `h_${"e".repeat(20)}`,
            updatedAt: "2026-09-04T00:00:00.000Z",
          }),
        ],
        []
      ),
    ]);
    expect(rows[0]?.hostedId).toBe(`h_${"e".repeat(20)}`);
    expect(rows[1]?.hostedId).toBe(`h_${"d".repeat(20)}`);
    expect(rows[2]?.source).toBe("chain");
  });
});

describe("plan filters", () => {
  test("shows filters only when both types exist", () => {
    expect(planFilterOptions([])).toBeNull();
    expect(
      planFilterOptions(mergeCatalogPlans([hostedEntry()], []))
    ).toBeNull();
    expect(planFilterOptions(mergeCatalogPlans([], [ORIGIN_A]))).toBeNull();
    expect(
      planFilterOptions(mergeCatalogPlans([hostedEntry()], [ORIGIN_A]))
    ).toEqual(["all", "hosted", "chain"]);
  });

  test("applies hosted and chain filters", () => {
    const merged = mergeCatalogPlans([hostedEntry()], [ORIGIN_A]);
    expect(applyPlanFilter(merged, "all")).toHaveLength(2);
    expect(applyPlanFilter(merged, "hosted")).toHaveLength(1);
    expect(applyPlanFilter(merged, "hosted")[0]?.source).toBe("hosted");
    expect(applyPlanFilter(merged, "chain")).toHaveLength(1);
    expect(applyPlanFilter(merged, "chain")[0]?.source).toBe("chain");
  });
});

describe("plan display helpers", () => {
  test("formats dates and reports unknown dates as null", () => {
    expect(formatPlanDate(null)).toBeNull();
    expect(formatPlanDate(undefined)).toBeNull();
    expect(formatPlanDate("")).toBeNull();
    expect(formatPlanDate("not-a-date")).toBeNull();
    const label = formatPlanDate("2026-08-31T12:00:00.000Z");
    expect(label).not.toBeNull();
    expect(label).toContain("2026");
  });

  test("labels repositories compactly", () => {
    expect(
      planRepoLabel({
        repoHost: "github.com",
        repoName: "repo",
        repoOrg: "org",
      })
    ).toBe("org/repo");
    expect(
      planRepoLabel({ repoHost: null, repoName: "repo", repoOrg: null })
    ).toBe("repo");
    expect(
      planRepoLabel({ repoHost: "example.com", repoName: null, repoOrg: null })
    ).toBe("example.com");
    expect(
      planRepoLabel({ repoHost: null, repoName: null, repoOrg: null })
    ).toBe("No repository");
  });
});
