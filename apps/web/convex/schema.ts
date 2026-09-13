import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const itemKind = v.union(
  v.literal("annotation"),
  v.literal("document"),
  v.literal("text-block")
);
export default defineSchema({
  changes: defineTable({
    ciphertext: v.string(),
    key: v.string(),
    kind: itemKind,
    operationId: v.string(),
    participantId: v.id("participants"),
    revision: v.number(),
    roomId: v.id("rooms"),
    sequence: v.number(),
    sessionId: v.id("sessions"),
  })
    .index("by_roomId_and_sequence", ["roomId", "sequence"])
    .index("by_roomId_and_operationId", ["roomId", "operationId"]),
  items: defineTable({
    ciphertext: v.string(),
    key: v.string(),
    kind: itemKind,
    participantId: v.id("participants"),
    revision: v.number(),
    roomId: v.id("rooms"),
    sequence: v.number(),
    sessionId: v.id("sessions"),
  })
    .index("by_roomId_and_key", ["roomId", "key"])
    .index("by_roomId", ["roomId"]),
  participants: defineTable({
    contributed: v.boolean(),
    profileCipher: v.string(),
    revision: v.number(),
    roomId: v.id("rooms"),
    secretHash: v.string(),
  })
    .index("by_roomId", ["roomId"])
    .index("by_roomId_and_secretHash", ["roomId", "secretHash"]),
  rooms: defineTable({
    authHash: v.string(),
    contributorCount: v.number(),
    hasTextBlocks: v.optional(v.boolean()),
    itemCount: v.number(),
    metadataCipher: v.string(),
    participantCount: v.number(),
    sequence: v.number(),
    sessionCount: v.number(),
  }),
  sessions: defineTable({
    clickCount: v.optional(v.number()),
    cursorCipher: v.optional(v.string()),
    cursorUpdatedAt: v.optional(v.number()),
    kind: v.union(v.literal("human"), v.literal("agent")),
    lastClickCipher: v.optional(v.string()),
    participantId: v.id("participants"),
    roomId: v.id("rooms"),
    secretHash: v.string(),
  })
    .index("by_roomId_and_secretHash", ["roomId", "secretHash"])
    .index("by_roomId", ["roomId"]),
});
