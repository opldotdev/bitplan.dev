import { expect, test } from "bun:test";
import { PrivateKey, ProtoWallet } from "@bsv/sdk";
import {
  openCheckpointEnvelope,
  sealCheckpointEnvelope,
} from "./checkpoint-envelope";
import { openEnvelope, parseEnvelope } from "./envelope";

test("a separately sealed checkpoint preserves embedded image bytes and intended readers", async () => {
  const sender = new ProtoWallet(new PrivateKey(1));
  const reader = new ProtoWallet(new PrivateKey(2));
  const identity = (await reader.getPublicKey({ identityKey: true })).publicKey;
  const checkpoint = {
    annotations: [
      {
        anchor: { point: { x: 0.2, y: 0.5 } },
        content: {
          alt: "Sticker",
          dataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
          type: "image",
        },
        createdAt: "2026-09-13T00:00:00Z",
        id: "image-note",
        participantId: "reviewer",
        placement: { dx: 12, dy: 4 },
        revision: 1,
        sessionId: "browser",
        status: "open",
        updatedAt: "2026-09-13T00:00:00Z",
      },
    ],
    knownHeads: [],
    participantId: "reviewer",
    previous: null,
    schema: "bitplan-annotation-checkpoint/1",
    source: {
      origin: "h_abcdefghijklmnopqrst",
      sha256: "a".repeat(64),
      version: 3,
    },
    target: {
      kind: "same-tx",
      origin: null,
      outputIndex: 0,
      sha256: "a".repeat(64),
      version: 1,
    },
  };
  const bytes = await sealCheckpointEnvelope(
    sender,
    checkpoint,
    "checkpoint-test",
    [identity]
  );
  expect(parseEnvelope(bytes).header.key.slots).toHaveLength(2);
  expect((await openCheckpointEnvelope(reader, bytes)).checkpoint).toEqual(
    checkpoint
  );
  await expect(openEnvelope(reader, bytes)).rejects.toThrow("no html document");
  expect(() =>
    sealCheckpointEnvelope(
      sender,
      { ...checkpoint, schema: "wrong" },
      "invalid",
      [identity]
    )
  ).toThrow();
});
