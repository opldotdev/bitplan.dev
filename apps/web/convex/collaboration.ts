import { Hash, Utils } from "@bsv/sdk";
import { Presence } from "@convex-dev/presence";
import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { itemKind } from "./schema";

const presence = new Presence(components.presence);
const CAPABILITY = /^[A-Za-z0-9_-]{43}$/;
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9+/]+=*$/;
const OPERATION_KEY = /^[a-zA-Z0-9_-]{1,128}$/;
const limiter = new RateLimiter(components.rateLimiter, {
  create: { capacity: 5, kind: "token bucket", period: MINUTE, rate: 20 },
  cursor: { capacity: 10, kind: "token bucket", period: MINUTE, rate: 300 },
  join: { capacity: 20, kind: "token bucket", period: MINUTE, rate: 60 },
  write: { capacity: 20, kind: "token bucket", period: MINUTE, rate: 120 },
});
const access = { proof: v.string(), roomId: v.id("rooms") };
const authenticated = { ...access, sessionProof: v.string() };
const itemValue = v.object({
  ciphertext: v.string(),
  key: v.string(),
  kind: itemKind,
  participantId: v.id("participants"),
  revision: v.number(),
  sequence: v.number(),
  sessionId: v.id("sessions"),
});

function hash(proof: string): string {
  if (!CAPABILITY.test(proof)) {
    throw new ConvexError("Invalid capability.");
  }
  return Utils.toHex(Hash.sha256(Array.from(new TextEncoder().encode(proof))));
}
function cipher(value: string, limit = 340_000) {
  if (value.length > limit || !CIPHERTEXT.test(value)) {
    throw new ConvexError("Invalid encrypted item.");
  }
}
async function authorize(
  ctx: QueryCtx | MutationCtx,
  args: { roomId: Id<"rooms">; proof: string }
) {
  const room = await ctx.db.get("rooms", args.roomId);
  if (!room || room.authHash !== hash(args.proof)) {
    throw new ConvexError("Invalid collaboration invitation.");
  }
  return room;
}
async function sessionFor(
  ctx: QueryCtx | MutationCtx,
  args: { roomId: Id<"rooms">; proof: string; sessionProof: string }
) {
  const room = await authorize(ctx, args);
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_roomId_and_secretHash", (q) =>
      q.eq("roomId", room._id).eq("secretHash", hash(args.sessionProof))
    )
    .unique();
  if (!session) {
    throw new ConvexError("Join this collaboration first.");
  }
  return { room, session };
}

/** A room is an independent overlay workspace, never proof of ordinal ownership. */
export const create = mutation({
  args: { metadataCipher: v.string(), proof: v.string() },
  handler: async (ctx, args) => {
    const authHash = hash(args.proof);
    cipher(args.metadataCipher, 16_000);
    await limiter.limit(ctx, "create", { throws: true });
    return ctx.db.insert("rooms", {
      authHash,
      contributorCount: 0,
      itemCount: 0,
      metadataCipher: args.metadataCipher,
      participantCount: 0,
      sequence: 0,
      sessionCount: 0,
    });
  },
  returns: v.id("rooms"),
});

/** Independent participant proof permits explicit bot handoff, not name matching. */
export const join = mutation({
  args: {
    ...access,
    kind: v.union(v.literal("human"), v.literal("agent")),
    participantProof: v.string(),
    profileCipher: v.string(),
    sessionProof: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await authorize(ctx, args);
    const secretHash = hash(args.participantProof);
    const sessionHash = hash(args.sessionProof);
    cipher(args.profileCipher, 4000);
    const priorSession = await ctx.db
      .query("sessions")
      .withIndex("by_roomId_and_secretHash", (q) =>
        q.eq("roomId", room._id).eq("secretHash", sessionHash)
      )
      .unique();
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_roomId_and_secretHash", (q) =>
        q.eq("roomId", room._id).eq("secretHash", secretHash)
      )
      .unique();
    if (priorSession) {
      if (
        !participant ||
        priorSession.participantId !== participant._id ||
        priorSession.kind !== args.kind
      ) {
        throw new ConvexError("Session capability already used.");
      }
      return { participantId: participant._id, sessionId: priorSession._id };
    }
    await limiter.limit(ctx, "join", { key: room._id, throws: true });
    if (
      room.sessionCount >= 512 ||
      (!participant && room.participantCount >= 100)
    ) {
      throw new ConvexError("This room has reached its collaborator limit.");
    }
    let participantId: Id<"participants">;
    if (participant) {
      participantId = participant._id;
    } else {
      participantId = await ctx.db.insert("participants", {
        contributed: false,
        profileCipher: args.profileCipher,
        revision: 1,
        roomId: room._id,
        secretHash,
      });
    }
    const sessionId = await ctx.db.insert("sessions", {
      kind: args.kind,
      participantId,
      roomId: room._id,
      secretHash: sessionHash,
    });
    await ctx.db.patch("rooms", room._id, {
      participantCount: room.participantCount + (participant ? 0 : 1),
      sessionCount: room.sessionCount + 1,
    });
    return { participantId, sessionId };
  },
  returns: v.object({
    participantId: v.id("participants"),
    sessionId: v.id("sessions"),
  }),
});

export const info = query({
  args: access,
  handler: async (ctx, args) => {
    const room = await authorize(ctx, args);
    return {
      contributorCount: room.contributorCount,
      metadataCipher: room.metadataCipher,
      sequence: room.sequence,
    };
  },
  returns: v.object({
    contributorCount: v.number(),
    metadataCipher: v.string(),
    sequence: v.number(),
  }),
});
export const profiles = query({
  args: access,
  handler: async (ctx, args) => {
    await authorize(ctx, args);
    const rows = await ctx.db
      .query("participants")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .take(100);
    return rows.map((row) => ({
      contributed: row.contributed,
      participantId: row._id,
      profileCipher: row.profileCipher,
      revision: row.revision,
    }));
  },
  returns: v.array(
    v.object({
      contributed: v.boolean(),
      participantId: v.id("participants"),
      profileCipher: v.string(),
      revision: v.number(),
    })
  ),
});
export const updateProfile = mutation({
  args: {
    ...authenticated,
    expectedRevision: v.number(),
    profileCipher: v.string(),
  },
  handler: async (ctx, args) => {
    const { room, session } = await sessionFor(ctx, args);
    cipher(args.profileCipher, 4000);
    const participant = await ctx.db.get("participants", session.participantId);
    if (!participant || participant.revision !== args.expectedRevision) {
      throw new ConvexError("Profile changed. Refresh before saving.");
    }
    await limiter.limit(ctx, "write", { key: room._id, throws: true });
    await ctx.db.patch("participants", participant._id, {
      profileCipher: args.profileCipher,
      revision: participant.revision + 1,
    });
    return participant.revision + 1;
  },
  returns: v.number(),
});
export const items = query({
  args: { ...access, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await authorize(ctx, args);
    if (args.paginationOpts.numItems > 20) {
      throw new ConvexError("Read at most 20 items per page.");
    }
    const page = await ctx.db
      .query("items")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map(
        ({
          key,
          kind,
          revision,
          participantId,
          sessionId,
          ciphertext,
          sequence,
        }) => ({
          ciphertext,
          key,
          kind,
          participantId,
          revision,
          sequence,
          sessionId,
        })
      ),
    };
  },
  returns: paginationResultValidator(itemValue),
});
export const changesSince = query({
  args: { ...access, after: v.number() },
  handler: async (ctx, args) => {
    await authorize(ctx, args);
    if (!Number.isSafeInteger(args.after) || args.after < 0) {
      throw new ConvexError("Invalid change cursor.");
    }
    const rows = await ctx.db
      .query("changes")
      .withIndex("by_roomId_and_sequence", (q) =>
        q.eq("roomId", args.roomId).gt("sequence", args.after)
      )
      .take(20);
    return rows.map(
      ({
        key,
        kind,
        revision,
        participantId,
        sessionId,
        ciphertext,
        sequence,
      }) => ({
        ciphertext,
        key,
        kind,
        participantId,
        revision,
        sequence,
        sessionId,
      })
    );
  },
  returns: v.array(itemValue),
});
export const write = mutation({
  args: {
    ...authenticated,
    ciphertext: v.string(),
    expectedRevision: v.number(),
    key: v.string(),
    kind: itemKind,
    operationId: v.string(),
  },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one transactional mutation keeps authorization, idempotency, revision checks, and counters atomic
  handler: async (ctx, args) => {
    const { room, session } = await sessionFor(ctx, args);
    cipher(args.ciphertext);
    if (
      !(
        OPERATION_KEY.test(args.key) &&
        OPERATION_KEY.test(args.operationId) &&
        Number.isSafeInteger(args.expectedRevision)
      ) ||
      args.expectedRevision < 0 ||
      (args.kind === "document" && args.key !== "document")
    ) {
      throw new ConvexError("Invalid operation.");
    }
    const previous = await ctx.db
      .query("changes")
      .withIndex("by_roomId_and_operationId", (q) =>
        q.eq("roomId", room._id).eq("operationId", args.operationId)
      )
      .unique();
    if (previous) {
      if (
        previous.key !== args.key ||
        previous.sessionId !== session._id ||
        previous.ciphertext !== args.ciphertext ||
        previous.kind !== args.kind ||
        previous.revision !== args.expectedRevision + 1
      ) {
        throw new ConvexError("Operation ID reused with different content.");
      }
      return { revision: previous.revision, sequence: previous.sequence };
    }
    const existing = await ctx.db
      .query("items")
      .withIndex("by_roomId_and_key", (q) =>
        q.eq("roomId", room._id).eq("key", args.key)
      )
      .unique();
    if ((existing?.revision ?? 0) !== args.expectedRevision) {
      throw new ConvexError(
        "This item changed. Review the latest version before saving."
      );
    }
    if (
      existing &&
      (existing.kind !== args.kind ||
        (args.kind === "annotation" &&
          existing.participantId !== session.participantId))
    ) {
      throw new ConvexError("Only the annotation author can change it.");
    }
    if (!existing && room.itemCount >= 1000) {
      throw new ConvexError("This room has reached its item limit.");
    }
    await limiter.limit(ctx, "write", { key: room._id, throws: true });
    const revision = args.expectedRevision + 1;
    const sequence = room.sequence + 1;
    const item = {
      ciphertext: args.ciphertext,
      key: args.key,
      kind: args.kind,
      participantId: session.participantId,
      revision,
      roomId: room._id,
      sequence,
      sessionId: session._id,
    };
    if (existing) {
      await ctx.db.replace("items", existing._id, item);
    } else {
      await ctx.db.insert("items", item);
    }
    await ctx.db.insert("changes", { ...item, operationId: args.operationId });
    const participant = await ctx.db.get("participants", session.participantId);
    if (!participant) {
      throw new ConvexError("Participant unavailable.");
    }
    if (!participant.contributed) {
      await ctx.db.patch("participants", participant._id, {
        contributed: true,
      });
    }
    await ctx.db.patch("rooms", room._id, {
      contributorCount:
        room.contributorCount + (participant.contributed ? 0 : 1),
      itemCount: room.itemCount + (existing ? 0 : 1),
      sequence,
    });
    return { revision, sequence };
  },
  returns: v.object({ revision: v.number(), sequence: v.number() }),
});

export const heartbeat = mutation({
  args: authenticated,
  handler: async (ctx, args) => {
    const { session } = await sessionFor(ctx, args);
    await limiter.limit(ctx, "cursor", { key: session._id, throws: true });
    return presence.heartbeat(
      ctx,
      args.roomId,
      session._id,
      session._id,
      15_000
    );
  },
  returns: v.object({ roomToken: v.string(), sessionToken: v.string() }),
});
export const moveCursor = mutation({
  args: {
    ...authenticated,
    ciphertext: v.string(),
    click: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { session } = await sessionFor(ctx, args);
    cipher(args.ciphertext, 8000);
    await limiter.limit(ctx, "cursor", { key: session._id, throws: true });
    await presence.updateRoomUser(ctx, args.roomId, session._id, {
      ciphertext: args.ciphertext,
    });
    // Last location is durable; presence alone must never imply an agent is still running.
    await ctx.db.patch("sessions", session._id, {
      cursorCipher: args.ciphertext,
      cursorUpdatedAt: Date.now(),
      ...(args.click
        ? {
            clickCount: (session.clickCount ?? 0) + 1,
            lastClickCipher: args.ciphertext,
          }
        : {}),
    });
    return null;
  },
  returns: v.null(),
});
export const online = query({
  args: { ...access, roomToken: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args);
    const members = await presence.list(ctx, args.roomToken, 100);
    const onlineIds = new Set(
      members.filter((member) => member.online).map((member) => member.userId)
    );
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .take(512);
    return sessions.map((session) => ({
      ciphertext: session.cursorCipher ?? null,
      clickCount: session.clickCount ?? 0,
      kind: session.kind,
      online: onlineIds.has(session._id),
      participantId: session.participantId,
      sessionId: session._id,
      updatedAt: session.cursorUpdatedAt ?? 0,
    }));
  },
  returns: v.array(
    v.object({
      ciphertext: v.union(v.string(), v.null()),
      clickCount: v.number(),
      kind: v.union(v.literal("human"), v.literal("agent")),
      online: v.boolean(),
      participantId: v.id("participants"),
      sessionId: v.id("sessions"),
      updatedAt: v.number(),
    })
  ),
});
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: (ctx, args) => {
    if (args.sessionToken.length > 256) {
      throw new ConvexError("Invalid session token.");
    }
    return presence.disconnect(ctx, args.sessionToken);
  },
  returns: v.null(),
});
