import { expect, test } from "bun:test";
import {
  annotationReplies,
  contributionOrder,
  mentionParts,
  roomHandles,
} from "./annotation-thread";
import { parseAnnotation } from "./annotations";

test("replies stay with the exact document target and sort deterministically", () => {
  const root = parseAnnotation({
    anchor: { point: { x: 0.2, y: 0.3 } },
    content: { text: "Question", type: "text" },
    createdAt: "2026-09-12T00:00:00Z",
    id: "root",
    participantId: "alice",
    placement: { dx: 0, dy: 0 },
    revision: 1,
    sessionId: "session",
    status: "open",
    target: {
      origin: "h_12345678901234567890",
      sha256: "a".repeat(64),
      version: 1,
    },
    updatedAt: "2026-09-12T00:00:00Z",
  });
  const reply = {
    ...root,
    id: "reply",
    participantId: "bob",
    replyTo: root.id,
  };
  const nextVersion = {
    ...reply,
    id: "other",
    target: { ...root.target, version: 2 },
  };
  const laterReply = { ...reply, createdAt: "2026-09-12T00:01:00Z" };
  expect(
    [laterReply, root].sort(contributionOrder).map((item) => item.id)
  ).toEqual(["root", "reply"]);
  expect(
    annotationReplies(root, [nextVersion, reply, root]).map((item) => item.id)
  ).toEqual(["reply"]);
});

test("mentions highlight known room profiles without impersonating duplicate names", () => {
  const handles = roomHandles({
    person1: { character: "Tina", name: "Tina" },
    person2: { character: "Tina", name: "Tina" },
    person3: { character: "Wags", name: "Dave" },
  });
  expect(new Set(handles.map((item) => item.handle)).size).toBe(3);
  const parts = mentionParts("@tina @tina-person2 @Dave @unknown", handles);
  expect(
    parts.filter((part) => part.recipient).map((part) => part.recipient?.id)
  ).toEqual(["person2", "person3"]);
  expect(
    mentionParts("mail@Dave.example", handles).some((part) => part.recipient)
  ).toBe(false);
});
