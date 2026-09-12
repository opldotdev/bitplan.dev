import { expect, test } from "bun:test";
import {
  decryptRoomValue,
  encryptRoomValue,
  newCapability,
  roomProof,
} from "./collaboration-crypto";
import { parseLinkFragment } from "./link-reader";

test("room encryption binds context and separates server proof from reader keys", async () => {
  const secret = newCapability();
  const cipher = await encryptRoomValue(secret, "room:item:1:author", {
    text: "private note",
  });
  expect(await decryptRoomValue(secret, "room:item:1:author", cipher)).toEqual({
    text: "private note",
  });
  expect(cipher).not.toContain("private note");
  await expect(
    decryptRoomValue(secret, "room:item:2:author", cipher)
  ).rejects.toThrow();
  await expect(
    decryptRoomValue(await roomProof(secret), "room:item:1:author", cipher)
  ).rejects.toThrow();
  const reader = newCapability();
  expect(parseLinkFragment(`#k=${reader}&collab=${secret}&room=example`)).toBe(
    parseLinkFragment(`#k=${reader}`)
  );
  expect(parseLinkFragment(`#k=${reader}&k=${secret}`)).toBeNull();
});
