/** Human-readable byte length for the encrypted-state meta row. */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Middle-truncate a long origin outpoint for display. */
export function truncateMiddle(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Share-card / OG copy. Public metadata only; never plaintext. */
export function draftShareDescription(input: {
  origin: string | null;
  found: boolean;
  byteLength?: number | null;
  version?: number | null;
}): string {
  if (!input.origin) {
    return "Encrypted draft.";
  }
  const origin = truncateMiddle(input.origin);
  if (!input.found) {
    return `No draft at ${origin}.`;
  }
  const extras: string[] = [];
  if (typeof input.byteLength === "number" && input.byteLength > 0) {
    extras.push(formatByteSize(input.byteLength));
  }
  if (typeof input.version === "number" && input.version > 0) {
    extras.push(`v${input.version}`);
  }
  if (extras.length === 0) {
    return `Encrypted draft ${origin}.`;
  }
  return `Encrypted draft ${origin}. ${extras.join(", ")}.`;
}
