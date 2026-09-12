export interface SettledChangePage<T> {
  failures: unknown[];
  lastSequence: number | null;
  values: T[];
}

export interface SettledRows<T> {
  failures: unknown[];
  values: T[];
}

/** Preserve trusted row metadata even when an encrypted payload is invalid. */
export function latestRevision<Row extends { revision: number }>(
  rows: readonly Row[],
  include: (row: Row) => boolean
): number | null {
  let latest: number | null = null;
  for (const row of rows) {
    if (include(row) && (latest === null || row.revision > latest)) {
      latest = row.revision;
    }
  }
  return latest;
}

/** Isolate independently controlled encrypted rows from one another. */
export async function settleRows<Row, Value>(
  rows: readonly Row[],
  decode: (row: Row) => Promise<Value>
): Promise<SettledRows<Value>> {
  const settled = await Promise.allSettled(rows.map(decode));
  const failures: unknown[] = [];
  const values: Value[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      values.push(result.value);
    } else {
      failures.push(result.reason);
    }
  }
  return { failures, values };
}

/** Isolate invalid encrypted rows while preserving ordered cursor progress. */
export async function settleChangePage<Row extends { sequence: number }, Value>(
  rows: readonly Row[],
  decode: (row: Row) => Promise<Value>
): Promise<SettledChangePage<Value>> {
  const { failures, values } = await settleRows(rows, decode);
  return {
    failures,
    lastSequence: rows.at(-1)?.sequence ?? null,
    values,
  };
}
