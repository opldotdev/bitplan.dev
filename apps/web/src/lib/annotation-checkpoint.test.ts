import { expect, test } from "bun:test";
import {
  type AnnotationCheckpoint,
  type CheckpointRecord,
  MAX_ANNOTATION_CHECKPOINT_BYTES,
  parseAnnotationCheckpoint,
  parseCheckpointDocumentReference,
  replayAnnotationCheckpoints,
  resolveCheckpointDocumentReference,
} from "./annotation-checkpoint";

const point = (n: number, index = 0) =>
  `${n.toString(16).padStart(64, "0")}_${index}`;
const document = {
  kind: "outpoint" as const,
  origin: point(1),
  outpoint: point(2),
  sha256: "a".repeat(64),
  version: 2,
};
function note(id = "note", participantId = "alice") {
  return {
    anchor: { point: { x: 0.5, y: 0.5 } },
    content: { text: "Review this.", type: "text" as const },
    createdAt: "2026-09-13T00:00:00Z",
    id,
    participantId,
    placement: { dx: 0, dy: 0 },
    revision: 1,
    sessionId: "browser",
    status: "open" as const,
    updatedAt: "2026-09-13T00:00:00Z",
  };
}
function payload(
  overrides: Partial<AnnotationCheckpoint> = {}
): AnnotationCheckpoint {
  return {
    annotations: [note()],
    knownHeads: [],
    participantId: "alice",
    previous: null,
    schema: "bitplan-annotation-checkpoint/1",
    target: document,
    ...overrides,
  };
}
function record(
  n: number,
  overrides: Partial<AnnotationCheckpoint> = {},
  stream = n
): CheckpointRecord {
  return {
    outpoint: point(n),
    payload: payload(overrides),
    streamOrigin: point(stream),
  };
}

test("checkpoint round-trips a full bounded snapshot and preserves hosted provenance", () => {
  const source = {
    origin: "h_12345678901234567890",
    sha256: "b".repeat(64),
    version: 7,
  };
  const checkpoint = payload({
    annotations: [
      { ...note("text"), replyTo: "external-bob-note" },
      { ...note("html"), content: { html: "<b>Local HTML</b>", type: "html" } },
      {
        ...note("image"),
        content: {
          alt: "Diagram",
          dataUrl: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"/>')}`,
          type: "image",
        },
      },
      {
        ...note("drawing"),
        content: { strokes: [[{ x: 0, y: 1 }]], type: "drawing" },
      },
    ],
    source,
  });
  const parsed = parseAnnotationCheckpoint(
    JSON.parse(JSON.stringify(checkpoint))
  );
  expect(parsed.source).toEqual(source);
  expect(parsed.annotations.map((item) => item.id)).toEqual([
    "drawing",
    "html",
    "image",
    "text",
  ]);
  expect(parsed.annotations.every((item) => !("target" in item))).toBe(true);
  expect(
    resolveCheckpointDocumentReference(parsed.target, "f".repeat(64))
  ).toEqual({
    origin: point(1),
    outpoint: point(2),
    sha256: "a".repeat(64),
    version: 2,
  });
});

test("same-transaction references do not embed future txids and resolve only in containing context", () => {
  const target = {
    kind: "same-tx" as const,
    origin: null,
    outputIndex: 0,
    sha256: "a".repeat(64),
    version: 1,
  };
  const parsed = parseAnnotationCheckpoint(payload({ target }));
  expect(JSON.stringify(parsed)).not.toContain("0".repeat(64));
  const replay = replayAnnotationCheckpoints(
    [{ outpoint: point(9, 1), payload: parsed, streamOrigin: point(9, 1) }],
    [point(9, 1)]
  );
  expect(replay.timeline[0].target).toEqual({
    origin: point(9),
    outpoint: point(9),
    sha256: "a".repeat(64),
    version: 1,
  });
  expect(replay.timeline[0].annotations[0].target).toEqual(
    replay.timeline[0].target
  );
  expect(() =>
    replayAnnotationCheckpoints([record(9, { target })], [point(9)])
  ).toThrow("itself");
  for (const invalid of [
    { ...target, version: 2 },
    { ...target, outputIndex: -1 },
    { ...target, outputIndex: 0x1_00_00_00_00 },
    { ...target, outputIndex: 1.5 },
    { ...document, outpoint: `${"1".repeat(64)}_01` },
    { ...document, outpoint: `${"1".repeat(64)}_4294967296` },
    { ...document, sha256: "nope" },
    { ...document, version: Number.NaN },
  ]) {
    expect(() => parseCheckpointDocumentReference(invalid)).toThrow();
  }
  expect(() =>
    resolveCheckpointDocumentReference(target, "not-a-txid")
  ).toThrow();
});

test("replay is deterministic, preserves concurrent streams and replaces only each stream's snapshot", () => {
  const alice = record(10);
  const bob = record(20, {
    annotations: [note("note", "bob")],
    participantId: "bob",
  });
  const aliceNext = record(
    11,
    { annotations: [], knownHeads: [point(20)], previous: point(10) },
    10
  );
  const first = replayAnnotationCheckpoints(
    [alice, bob, aliceNext],
    [point(11), point(20)]
  );
  const second = replayAnnotationCheckpoints(
    [aliceNext, bob, alice],
    [point(20), point(11)]
  );
  expect(second).toEqual(first);
  expect(first.timeline.map((item) => item.outpoint)).toEqual([
    point(10),
    point(20),
    point(11),
  ]);
  expect(
    first.snapshots.map((item) => [
      item.payload.participantId,
      item.annotations.length,
    ])
  ).toEqual([
    ["bob", 1],
    ["alice", 0],
  ]);
  expect(first.completeThroughKnownHeads).toBe(true);
  expect(first.verification).toBe("unverified");
  expect(first.discovery).toBe("supplied-heads-only");
  expect(first.forks).toEqual([]);
  // Even a supplied but unreferenced record is not discovered from a head.
  expect(
    replayAnnotationCheckpoints([alice, bob], [point(10)]).timeline
  ).toHaveLength(1);
});

test("replay reports absent references and retains conflicting branch heads separately", () => {
  const genesis = record(10);
  const left = record(11, { knownHeads: [point(30)], previous: point(10) }, 10);
  const right = record(12, { previous: point(10) }, 10);
  const replay = replayAnnotationCheckpoints(
    [right, left, genesis],
    [point(12), point(11), point(40)]
  );
  expect(replay.missingReferences).toEqual([point(30), point(40)]);
  expect(replay.completeThroughKnownHeads).toBe(false);
  expect(replay.forks).toEqual([
    { heads: [point(11), point(12)], streamOrigin: point(10) },
  ]);
  expect(replay.snapshots).toHaveLength(2);
  expect(
    replayAnnotationCheckpoints([left], [point(11)]).missingReferences
  ).toEqual([point(10), point(30)]);
});

test("rejects malformed snapshots, cross-stream predecessors, cycles, and unbounded replay", () => {
  for (const invalid of [
    payload({ annotations: [note(), note()] }),
    payload({ annotations: [note("note", "bob")] }),
    payload({ annotations: [{ ...note(), replyTo: "note" }] }),
    payload({
      annotations: [
        { ...note("one"), replyTo: "two" },
        { ...note("two"), replyTo: "one" },
      ],
    }),
    payload({ annotations: [{ ...note(), updatedAt: "2020-01-01" }] }),
    payload({ knownHeads: [point(10), point(10)] }),
    { ...payload(), annotations: [{ ...note(), target: document }] },
    { ...payload(), unknown: "x".repeat(MAX_ANNOTATION_CHECKPOINT_BYTES) },
  ]) {
    expect(() => parseAnnotationCheckpoint(invalid)).toThrow();
  }
  expect(() =>
    replayAnnotationCheckpoints([record(10), record(10)], [point(10)])
  ).toThrow("Duplicate");
  expect(() =>
    replayAnnotationCheckpoints(
      [record(10, { previous: point(9) })],
      [point(10)]
    )
  ).toThrow("genesis");
  expect(() =>
    replayAnnotationCheckpoints(
      [record(10), record(11, { previous: point(10) }, 20)],
      [point(11)]
    )
  ).toThrow("another stream");
  expect(() =>
    replayAnnotationCheckpoints(
      [
        record(10),
        record(
          11,
          { annotations: [], participantId: "bob", previous: point(10) },
          10
        ),
      ],
      [point(11)]
    )
  ).toThrow("another stream");
  expect(() =>
    replayAnnotationCheckpoints(
      [
        record(10, { knownHeads: [point(20)] }),
        record(20, { knownHeads: [point(10)] }),
      ],
      [point(10)]
    )
  ).toThrow("Cyclic");
  expect(() =>
    replayAnnotationCheckpoints(
      Array.from({ length: 257 }, (_, i) => record(i)),
      []
    )
  ).toThrow("size limit");
});
