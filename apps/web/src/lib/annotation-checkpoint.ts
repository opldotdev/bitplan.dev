import {
  type Annotation,
  type DocumentTarget,
  parseAnnotation,
  parseDocumentTarget,
} from "./annotations";

/** Application plaintext inside the unchanged BPLN envelope. */
export type CheckpointDocumentReference =
  | {
      kind: "outpoint";
      origin: string;
      outpoint: string;
      sha256: string;
      version: number;
    }
  | {
      kind: "same-tx";
      origin: string | null;
      outputIndex: number;
      sha256: string;
      version: number;
    };

export interface AnnotationCheckpoint {
  /** Full snapshot for this participant, never a replacement for other streams. */
  annotations: Omit<Annotation, "target">[];
  knownHeads: string[];
  participantId: string;
  previous: string | null;
  schema: "bitplan-annotation-checkpoint/1";
  /** Original hosted/document version reviewed before publishing a replacement. */
  source?: DocumentTarget;
  target: CheckpointDocumentReference;
}

export const MAX_ANNOTATION_CHECKPOINT_BYTES = 4 * 1024 * 1024;
const MAX_RECORDS = 256;
const MAX_REPLAY_BYTES = 32 * 1024 * 1024;
const OUTPOINT = /^([0-9a-f]{64})_(0|[1-9][0-9]{0,9})$/;
const HASH = /^[0-9a-f]{64}$/;
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const TXID = /^[0-9a-f]{64}$/;
// Used only to reuse the existing field validator before a same-tx ID exists.
// Never retained in the wire payload or returned as a resolved reference.
const VALIDATION_TXID = "0".repeat(64);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid annotation checkpoint object.");
  }
  return value as Record<string, unknown>;
}

function outpoint(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Invalid checkpoint outpoint.");
  }
  const match = OUTPOINT.exec(value);
  if (!match || Number(match[2]) > 0xff_ff_ff_ff) {
    throw new Error("Invalid checkpoint outpoint.");
  }
  return value;
}

function byteLength(value: unknown): number {
  const json = JSON.stringify(value);
  if (!json) {
    throw new Error("Invalid checkpoint JSON.");
  }
  return new TextEncoder().encode(json).byteLength;
}

function references(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) {
    throw new Error("Too many checkpoint references.");
  }
  const refs = value.map(outpoint);
  if (new Set(refs).size !== refs.length) {
    throw new Error("Duplicate checkpoint reference.");
  }
  return refs.sort();
}

export function parseCheckpointDocumentReference(
  value: unknown
): CheckpointDocumentReference {
  const ref = object(value);
  if (
    typeof ref.sha256 !== "string" ||
    !HASH.test(ref.sha256) ||
    typeof ref.version !== "number" ||
    !Number.isSafeInteger(ref.version) ||
    ref.version < 1
  ) {
    throw new Error("Invalid checkpoint document version/hash.");
  }
  if (ref.kind === "outpoint") {
    return {
      kind: ref.kind,
      origin: outpoint(ref.origin),
      outpoint: outpoint(ref.outpoint),
      sha256: ref.sha256,
      version: ref.version,
    };
  }
  if (
    ref.kind === "same-tx" &&
    typeof ref.outputIndex === "number" &&
    Number.isSafeInteger(ref.outputIndex) &&
    ref.outputIndex >= 0 &&
    ref.outputIndex <= 0xff_ff_ff_ff
  ) {
    const origin = ref.origin === null ? null : outpoint(ref.origin);
    if (origin === null && ref.version !== 1) {
      throw new Error("A new document origin starts at version 1.");
    }
    return {
      kind: ref.kind,
      origin,
      outputIndex: ref.outputIndex,
      sha256: ref.sha256,
      version: ref.version,
    };
  }
  throw new Error("Invalid checkpoint document reference.");
}

/** Resolves syntax only: callers must verify the referenced output and HTML hash. */
export function resolveCheckpointDocumentReference(
  reference: CheckpointDocumentReference,
  containingTxid: string
): DocumentTarget {
  const ref = parseCheckpointDocumentReference(reference);
  if (!TXID.test(containingTxid)) {
    throw new Error("Invalid containing transaction ID.");
  }
  if (ref.kind === "outpoint") {
    return {
      origin: ref.origin,
      outpoint: ref.outpoint,
      sha256: ref.sha256,
      version: ref.version,
    };
  }
  const resolved = `${containingTxid}_${ref.outputIndex}`;
  return {
    origin: ref.origin ?? resolved,
    outpoint: resolved,
    sha256: ref.sha256,
    version: ref.version,
  };
}

export function parseAnnotationCheckpoint(
  value: unknown
): AnnotationCheckpoint {
  if (byteLength(value) > MAX_ANNOTATION_CHECKPOINT_BYTES) {
    throw new Error("Annotation checkpoint exceeds the size limit.");
  }
  const input = object(value);
  if (
    input.schema !== "bitplan-annotation-checkpoint/1" ||
    typeof input.participantId !== "string" ||
    !ID.test(input.participantId) ||
    !Array.isArray(input.annotations) ||
    input.annotations.length > 1000
  ) {
    throw new Error("Invalid annotation checkpoint snapshot.");
  }
  const target = parseCheckpointDocumentReference(input.target);
  const validationTarget = resolveCheckpointDocumentReference(
    target,
    VALIDATION_TXID
  );
  const ids = new Map<string, Omit<Annotation, "target">>();
  const annotations = input.annotations.map((rawAnnotation) => {
    const item = object(rawAnnotation);
    if ("target" in item) {
      throw new Error("Snapshot annotations inherit the checkpoint target.");
    }
    const { target: _target, ...annotation } = parseAnnotation({
      ...item,
      target: validationTarget,
    });
    if (
      annotation.participantId !== input.participantId ||
      ids.has(annotation.id)
    ) {
      throw new Error(
        "Duplicate annotation or another participant's snapshot."
      );
    }
    if (Date.parse(annotation.updatedAt) < Date.parse(annotation.createdAt)) {
      throw new Error("Annotation update predates creation.");
    }
    ids.set(annotation.id, annotation);
    return annotation;
  });
  // External replies are retained; only a composed view can resolve them.
  const checked = new Set<string>();
  for (const item of annotations) {
    const visiting = new Set<string>();
    let cursor: string | undefined = item.id;
    while (cursor && ids.has(cursor) && !checked.has(cursor)) {
      if (visiting.has(cursor)) {
        throw new Error("Cyclic annotation replies.");
      }
      visiting.add(cursor);
      cursor = ids.get(cursor)?.replyTo;
    }
    for (const id of visiting) {
      checked.add(id);
    }
  }
  return {
    participantId: input.participantId,
    schema: input.schema,
    target,
    ...(input.source === undefined
      ? {}
      : { source: parseDocumentTarget(input.source) }),
    annotations: annotations.sort((a, b) => {
      if (a.id === b.id) {
        return 0;
      }
      return a.id < b.id ? -1 : 1;
    }),
    knownHeads: references(input.knownHeads),
    previous: input.previous === null ? null : outpoint(input.previous),
  };
}

/** Locations are unverified caller metadata, NOT proof of ordinal lineage. */
export interface CheckpointRecord {
  outpoint: string;
  payload: unknown;
  streamOrigin: string;
}

export interface ReplayedCheckpoint {
  annotations: Annotation[];
  outpoint: string;
  payload: AnnotationCheckpoint;
  streamOrigin: string;
  target: DocumentTarget;
}

/**
 * Deterministic replay of supplied heads and their reachable references only.
 * No fetching, signatures, chain verification, or unknown-branch discovery.
 * Full snapshots remain separate per stream/head; forks are never overwritten.
 */
export function replayAnnotationCheckpoints(
  records: readonly CheckpointRecord[],
  knownHeads: readonly string[]
) {
  if (records.length > MAX_RECORDS || byteLength(records) > MAX_REPLAY_BYTES) {
    throw new Error("Checkpoint replay exceeds the size limit.");
  }
  const heads = references(knownHeads);
  const byOutpoint = new Map<string, ReplayedCheckpoint>();
  for (const record of records) {
    const location = outpoint(record.outpoint);
    if (byOutpoint.has(location)) {
      throw new Error("Duplicate checkpoint record.");
    }
    const streamOrigin = outpoint(record.streamOrigin);
    const payload = parseAnnotationCheckpoint(record.payload);
    const target = resolveCheckpointDocumentReference(
      payload.target,
      location.split("_")[0]
    );
    if (
      payload.previous === location ||
      payload.knownHeads.includes(location) ||
      (payload.target.kind === "same-tx" && target.outpoint === location)
    ) {
      throw new Error("Checkpoint cannot reference itself.");
    }
    if ((payload.previous === null) !== (location === streamOrigin)) {
      throw new Error("Checkpoint genesis/previous reference mismatch.");
    }
    byOutpoint.set(location, {
      annotations: payload.annotations.map((item) => ({ ...item, target })),
      outpoint: location,
      payload,
      streamOrigin,
      target,
    });
  }
  const timeline: ReplayedCheckpoint[] = [];
  const missing = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(location: string) {
    if (visited.has(location)) {
      return;
    }
    if (visiting.has(location)) {
      throw new Error("Cyclic checkpoint references.");
    }
    const record = byOutpoint.get(location);
    if (!record) {
      missing.add(location);
      return;
    }
    visiting.add(location);
    const { previous } = record.payload;
    const predecessor = previous ? byOutpoint.get(previous) : undefined;
    if (
      predecessor &&
      (predecessor.streamOrigin !== record.streamOrigin ||
        predecessor.payload.participantId !== record.payload.participantId)
    ) {
      throw new Error(
        "Checkpoint predecessor belongs to another stream/participant."
      );
    }
    for (const ref of [
      ...new Set([
        ...record.payload.knownHeads,
        ...(previous ? [previous] : []),
      ]),
    ].sort()) {
      visit(ref);
    }
    visiting.delete(location);
    visited.add(location);
    timeline.push(record);
  }
  for (const head of heads) {
    visit(head);
  }
  const superseded = new Set(
    timeline.flatMap((record) =>
      record.payload.previous ? [record.payload.previous] : []
    )
  );
  const snapshots = timeline.filter(
    (record) => !superseded.has(record.outpoint)
  );
  const streams = new Map<string, string[]>();
  for (const snapshot of snapshots) {
    const streamHeads = streams.get(snapshot.streamOrigin) ?? [];
    streamHeads.push(snapshot.outpoint);
    streams.set(snapshot.streamOrigin, streamHeads);
  }
  return {
    /** Does not imply that these are all published branches. */
    completeThroughKnownHeads: missing.size === 0,
    discovery: "supplied-heads-only" as const,
    forks: [...streams]
      .filter(([, streamHeads]) => streamHeads.length > 1)
      .map(([streamOrigin, streamHeads]) => ({
        heads: streamHeads.sort(),
        streamOrigin,
      }))
      .sort((a, b) => (a.streamOrigin < b.streamOrigin ? -1 : 1)),
    missingReferences: [...missing].sort(),
    snapshots,
    timeline,
    verification: "unverified" as const,
  };
}
