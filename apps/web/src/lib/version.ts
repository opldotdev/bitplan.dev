/**
 * Viewer versions are 1-based (`?v=1` is the origin / ORDFS seq 0).
 * ORDFS sequence is 0-based; seq -1 is the tip.
 */

/** `?v=<n>` is 1-based. Returns null when absent or not a positive integer. */
const POSITIVE_INT = /^[1-9]\d*$/;

export function parseVersionQuery(
  value: string | string[] | null | undefined
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  if (!POSITIVE_INT.test(raw)) {
    return null;
  }
  return Number.parseInt(raw, 10);
}

export function versionToSeq(version: number): number {
  return version - 1;
}

export function seqToVersion(seq: number): number {
  return seq + 1;
}

/** Clamp a 1-based version into `[1, latest]`. */
export function clampVersion(version: number, latestVersion: number): number {
  if (latestVersion < 1) {
    return 1;
  }
  return Math.min(Math.max(version, 1), latestVersion);
}
