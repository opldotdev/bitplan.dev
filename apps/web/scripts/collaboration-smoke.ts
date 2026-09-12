/** Real two-client development check; creates a small encrypted test room. */
import assert from "node:assert/strict";
import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import {
  encryptRoomValue,
  newCapability,
  roomProof,
} from "../src/lib/collaboration-crypto";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (url !== "https://wary-wildebeest-416.convex.cloud") {
  throw new Error(
    "This check must only run on BitPlan’s named development deployment."
  );
}
const a = new ConvexClient(url);
const b = new ConvexClient(url);
try {
  const secret = newCapability();
  const proof = await roomProof(secret);
  const metadataCipher = await encryptRoomValue(secret, "metadata", {
    title: "Development smoke test",
  });
  const roomId = await a.mutation(api.collaboration.create, {
    metadataCipher,
    proof,
  });
  const profileCipher = await encryptRoomValue(secret, "profile", {
    character: "Martha",
    name: "Test",
  });
  const sessionProof = newCapability();
  const participantProof = newCapability();
  const one = await a.mutation(api.collaboration.join, {
    kind: "human",
    participantProof,
    profileCipher,
    proof,
    roomId,
    sessionProof,
  });
  const two = await b.mutation(api.collaboration.join, {
    kind: "human",
    participantProof: newCapability(),
    profileCipher,
    proof,
    roomId,
    sessionProof: newCapability(),
  });
  assert.notEqual(one.participantId, two.participantId);
  const bot = await b.mutation(api.collaboration.join, {
    kind: "agent",
    participantProof,
    profileCipher,
    proof,
    roomId,
    sessionProof: newCapability(),
  });
  assert.equal(one.participantId, bot.participantId);
  assert.notEqual(one.sessionId, bot.sessionId);
  const operation = {
    ciphertext: await encryptRoomValue(secret, "test", {
      text: "Test annotation",
    }),
    expectedRevision: 0,
    key: crypto.randomUUID(),
    kind: "annotation" as const,
    operationId: crypto.randomUUID(),
    proof,
    roomId,
    sessionProof,
  };
  const changed = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop();
      reject(new Error("Second client did not receive realtime update."));
    }, 15_000);
    const stop = b.onUpdate(
      api.collaboration.changesSince,
      { after: 0, proof, roomId },
      (rows) => {
        if (rows.some((row) => row.key === operation.key)) {
          clearTimeout(timeout);
          stop();
          resolve();
        }
      }
    );
  });
  const receipt = await a.mutation(api.collaboration.write, operation);
  await changed;
  assert.deepEqual(
    await a.mutation(api.collaboration.write, operation),
    receipt
  );
  await assert.rejects(() =>
    b.query(api.collaboration.info, { proof: newCapability(), roomId })
  );
  await assert.rejects(() =>
    b.mutation(api.collaboration.write, {
      ...operation,
      sessionProof: newCapability(),
    })
  );
  await assert.rejects(() =>
    a.mutation(api.collaboration.write, {
      ...operation,
      operationId: crypto.randomUUID(),
    })
  );
  const info = await a.query(api.collaboration.info, { proof, roomId });
  assert.equal(info.contributorCount, 1);
  assert.equal(info.sequence, 1);
  const tokens = await a.mutation(api.collaboration.heartbeat, {
    proof,
    roomId,
    sessionProof,
  });
  const cursorCipher = await encryptRoomValue(
    secret,
    `${roomId}:cursor:${one.sessionId}`,
    {
      anchor: { elementId: "test", point: { x: 0.25, y: 0.5 } },
      event: "click",
    }
  );
  await a.mutation(api.collaboration.moveCursor, {
    ciphertext: cursorCipher,
    click: true,
    proof,
    roomId,
    sessionProof,
  });
  await a.mutation(api.collaboration.disconnect, {
    sessionToken: tokens.sessionToken,
  });
  const positions = await b.query(api.collaboration.online, {
    proof,
    roomId,
    roomToken: tokens.roomToken,
  });
  const saved = positions.find((row) => row.sessionId === one.sessionId);
  assert.equal(saved?.ciphertext, cursorCipher);
  assert.equal(saved?.clickCount, 1);
  assert.equal(saved?.online, false);
  await assert.rejects(() =>
    b.mutation(api.collaboration.moveCursor, {
      ciphertext: cursorCipher,
      click: true,
      proof,
      roomId,
      sessionProof: newCapability(),
    })
  );
  console.log(
    "PASS: encrypted click location and count survive disconnect; forged session rejected."
  );
  console.log(
    "PASS: live cross-client update, distinct identities, linked bot, idempotency, conflict and unauthorized-operation rejection."
  );
} finally {
  await a.close();
  await b.close();
}
