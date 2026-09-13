"use client";

import { ConvexClient } from "convex/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  type Annotation,
  type AnnotationAnchor,
  type AnnotationContent,
  type DocumentTarget,
  parseAnchor,
  parseAnnotation,
  parseDocumentTarget,
  sameDocumentTarget,
} from "./annotations";
import {
  latestRevision,
  settleChangePage,
  settleRows,
} from "./collaboration-change-page";
import {
  collaborationFragment,
  decryptRoomValue,
  encryptRoomValue,
  newCapability,
  roomProof,
} from "./collaboration-crypto";
import {
  type CollaboratorProfile,
  loadProfile,
  parseProfile,
} from "./collaborator";
import {
  parseSharedDocument,
  type SharedDocument,
  sharedDocument,
} from "./shared-document";

interface Connection {
  client: ConvexClient;
  participantId: Id<"participants">;
  participantProof: string;
  proof: string;
  roomId: Id<"rooms">;
  secret: string;
  sessionId: Id<"sessions">;
  sessionProof: string;
}
export interface Cursor {
  anchor: AnnotationAnchor;
  clickCount: number;
  kind: "human" | "agent";
  online: boolean;
  participantId: string;
  sessionId: string;
  target: DocumentTarget;
  updatedAt: number;
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Collaboration unavailable.";

/** One operation surface shared by React, WebMCP, and headless clients. */
export function useCollaboration(target: DocumentTarget) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [documentDraft, setDocumentDraft] = useState<
    (SharedDocument & { revision: number }) | null
  >(null);
  const [documentRevision, setDocumentRevision] = useState(0);
  const [profiles, setProfiles] = useState<Record<string, CollaboratorProfile>>(
    {}
  );
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [contributorCount, setContributorCount] = useState(0);
  const [sequence, setSequence] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [online, setOnline] = useState(false);
  const connectionRef = useRef<Connection | null>(null);
  const connectionEpoch = useRef(0);
  const lastCursor = useRef(0);
  const cursorQueue = useRef<Promise<unknown>>(Promise.resolve());
  const targetRef = useRef(target);
  targetRef.current = target;
  const activeTarget =
    documentDraft && sameDocumentTarget(documentDraft.base, target)
      ? { ...target, sha256: documentDraft.sha256 }
      : target;
  const activeTargetRef = useRef(activeTarget);
  activeTargetRef.current = activeTarget;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;

  const connect = useCallback(
    async (invite: { roomId: string; secret: string }) => {
      if (!url) {
        throw new Error(
          "Realtime collaboration is not configured on this deployment."
        );
      }
      setConnecting(true);
      connectionEpoch.current += 1;
      const epoch = connectionEpoch.current;
      const client = new ConvexClient(url);
      try {
        const roomId = invite.roomId as Id<"rooms">;
        const proof = await roomProof(invite.secret);
        const info = await client.query(api.collaboration.info, {
          proof,
          roomId,
        });
        const initial = parseDocumentTarget(
          await decryptRoomValue(invite.secret, "metadata", info.metadataCipher)
        );
        if (epoch !== connectionEpoch.current) {
          await client.close();
          return;
        }
        if (initial.origin !== targetRef.current.origin) {
          throw new Error("This invitation belongs to a different plan.");
        }
        const storageKey = `bitplan:participant:${roomId}`;
        const participantProof =
          localStorage.getItem(storageKey) ?? newCapability();
        localStorage.setItem(storageKey, participantProof);
        // Presentation label only; it grants no additional capabilities.
        const kind =
          new URLSearchParams(window.location.hash.slice(1)).get("client") ===
          "agent"
            ? "agent"
            : "human";
        const sessionKey = `bitplan:session:${roomId}:${kind}`;
        const sessionProof =
          sessionStorage.getItem(sessionKey) ?? newCapability();
        sessionStorage.setItem(sessionKey, sessionProof);
        const profile = loadProfile(localStorage);
        const joined = await client.mutation(api.collaboration.join, {
          kind,
          participantProof,
          profileCipher: await encryptRoomValue(
            invite.secret,
            "profile",
            profile
          ),
          proof,
          roomId,
          sessionProof,
        });
        const next = {
          client,
          participantProof,
          proof,
          roomId,
          secret: invite.secret,
          sessionProof,
          ...joined,
        };
        if (epoch !== connectionEpoch.current) {
          await client.close();
          return;
        }
        connectionRef.current = next;
        setConnection(next);
        setError(null);
      } catch (failure) {
        await client.close();
        if (epoch === connectionEpoch.current) {
          throw failure;
        }
      } finally {
        if (epoch === connectionEpoch.current) {
          setConnecting(false);
        }
      }
    },
    [url]
  );

  useEffect(() => {
    try {
      const invite = collaborationFragment(window.location.hash);
      if (invite) {
        connect(invite).catch((failure) => setError(message(failure)));
      }
    } catch (failure) {
      setError(message(failure));
    }
    return () => {
      connectionEpoch.current += 1;
      connectionRef.current?.client.close().catch(() => undefined);
      connectionRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    if (!connection) {
      return;
    }
    const c = connection;
    const access = { proof: c.proof, roomId: c.roomId };
    let active = true;
    let stopChanges: (() => void) | undefined;
    let stopOnline: (() => void) | undefined;
    let presenceToken: string | undefined;
    const accumulated = new Map<string, Annotation>();
    let watchEpoch = 0;
    const fail = (failure: unknown) => {
      if (active) {
        setError(message(failure));
      }
    };
    function watch(after: number) {
      watchEpoch += 1;
      const watching = watchEpoch;
      let readEpoch = 0;
      stopChanges = c.client.onUpdate(
        api.collaboration.changesSince,
        { ...access, after },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ordered document and annotation reconciliation shares one subscription boundary
        async (rows) => {
          readEpoch += 1;
          const reading = readEpoch;
          try {
            const page = await settleChangePage(rows, async (row) => {
              if (row.kind === "document") {
                const draft = await parseSharedDocument(
                  await decryptRoomValue(
                    c.secret,
                    `${c.roomId}:${row.key}:${row.revision}:${row.participantId}`,
                    row.ciphertext
                  )
                );
                return { ...draft, revision: row.revision };
              }
              const value = parseAnnotation(
                await decryptRoomValue(
                  c.secret,
                  `${c.roomId}:${row.key}:${row.revision}:${row.participantId}`,
                  row.ciphertext
                )
              );
              if (
                value.id !== row.key ||
                value.revision !== row.revision ||
                value.participantId !== row.participantId ||
                value.sessionId !== row.sessionId
              ) {
                throw new Error(
                  "Annotation attribution does not match its author."
                );
              }
              return value;
            });
            if (!active || watching !== watchEpoch || reading !== readEpoch) {
              return;
            }
            const observedDocumentRevision = latestRevision(
              rows,
              (row) => row.kind === "document"
            );
            if (observedDocumentRevision !== null) {
              setDocumentRevision((previous) =>
                Math.max(previous, observedDocumentRevision)
              );
            }
            for (const item of page.values) {
              if ("schema" in item) {
                setDocumentDraft((previous) =>
                  !previous || previous.revision < item.revision
                    ? item
                    : previous
                );
              } else if (
                !accumulated.has(item.id) ||
                (accumulated.get(item.id)?.revision ?? 0) < item.revision
              ) {
                accumulated.set(item.id, item);
              }
            }
            setAnnotations([...accumulated.values()]);
            if (page.failures.length) {
              fail(page.failures[0]);
            }
            if (page.lastSequence !== null) {
              const last = page.lastSequence;
              setSequence(last);
              stopChanges?.();
              watch(last);
            }
          } catch (failure) {
            fail(failure);
          }
        },
        fail
      );
    }
    watch(0);
    const stopInfo = c.client.onUpdate(
      api.collaboration.info,
      access,
      (info) => setContributorCount(info.contributorCount),
      fail
    );
    let profileEpoch = 0;
    const stopProfiles = c.client.onUpdate(
      api.collaboration.profiles,
      access,
      async (rows) => {
        profileEpoch += 1;
        const epoch = profileEpoch;
        try {
          const settled = await settleRows(
            rows,
            async (row) =>
              [
                row.participantId,
                parseProfile(
                  await decryptRoomValue(c.secret, "profile", row.profileCipher)
                ),
              ] as const
          );
          if (active && epoch === profileEpoch) {
            setProfiles((previous) => ({
              ...previous,
              ...Object.fromEntries(settled.values),
            }));
            if (settled.failures.length) {
              fail(settled.failures[0]);
            }
          }
        } catch (failure) {
          fail(failure);
        }
      },
      fail
    );
    async function heartbeat() {
      try {
        const tokens = await c.client.mutation(api.collaboration.heartbeat, {
          ...access,
          sessionProof: c.sessionProof,
        });
        if (!active) {
          return;
        }
        setOnline(true);
        presenceToken = tokens.sessionToken;
        if (!stopOnline) {
          let epoch = 0;
          stopOnline = c.client.onUpdate(
            api.collaboration.online,
            { ...access, roomToken: tokens.roomToken },
            async (rows) => {
              epoch += 1;
              const reading = epoch;
              try {
                const settled = await settleRows(rows, async (row) => {
                  if (!row.ciphertext) {
                    return null;
                  }
                  const value = (await decryptRoomValue(
                    c.secret,
                    `${c.roomId}:cursor:${row.sessionId}`,
                    row.ciphertext
                  )) as { target: unknown; anchor: unknown };
                  return {
                    anchor: parseAnchor(value.anchor),
                    clickCount: row.clickCount,
                    kind: row.kind,
                    online: row.online,
                    participantId: row.participantId,
                    sessionId: row.sessionId,
                    target: parseDocumentTarget(value.target),
                    updatedAt: row.updatedAt,
                  };
                });
                if (active && reading === epoch) {
                  setCursors(
                    settled.values.filter(
                      (value): value is NonNullable<typeof value> =>
                        value !== null
                    )
                  );
                  if (settled.failures.length) {
                    fail(settled.failures[0]);
                  }
                }
              } catch (failure) {
                fail(failure);
              }
            },
            fail
          );
        }
      } catch (failure) {
        if (active) {
          setOnline(false);
          fail(failure);
        }
      }
    }
    heartbeat().catch(fail);
    const timer = setInterval(heartbeat, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
      stopChanges?.();
      stopInfo();
      stopProfiles();
      stopOnline?.();
      if (presenceToken) {
        c.client
          .mutation(api.collaboration.disconnect, {
            sessionToken: presenceToken,
          })
          .catch(() => undefined);
      }
    };
  }, [connection]);

  async function start() {
    if (!url || connecting || connection) {
      return;
    }
    setConnecting(true);
    const client = new ConvexClient(url);
    try {
      const secret = newCapability();
      const roomId = await client.mutation(api.collaboration.create, {
        metadataCipher: await encryptRoomValue(
          secret,
          "metadata",
          parseDocumentTarget(targetRef.current)
        ),
        proof: await roomProof(secret),
      });
      const params = new URLSearchParams(window.location.hash.slice(1));
      params.set("room", roomId);
      params.set("collab", secret);
      const location = new URL(window.location.href);
      location.searchParams.delete("collaborate");
      location.hash = params.toString();
      window.history.replaceState(null, "", location);
      await connect({ roomId, secret });
    } catch (failure) {
      setError(message(failure));
    } finally {
      await client.close();
      setConnecting(false);
    }
  }
  async function saveAnnotation(
    content: AnnotationContent,
    anchor: AnnotationAnchor,
    existing?: Annotation
  ) {
    const c = connectionRef.current;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: actions can race the asynchronous disconnect cleanup
    if (!c) {
      throw new Error("Open a collaboration invitation first.");
    }
    const now = new Date().toISOString();
    const annotation = parseAnnotation({
      anchor,
      content,
      id: existing?.id ?? crypto.randomUUID(),
      participantId: c.participantId,
      placement: existing?.placement ?? { dx: 0, dy: 0 },
      revision: (existing?.revision ?? 0) + 1,
      sessionId: c.sessionId,
      status: existing?.status ?? "open",
      target: existing?.target ?? activeTargetRef.current,
      ...(existing?.size ? { size: existing.size } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    const ciphertext = await encryptRoomValue(
      c.secret,
      `${c.roomId}:${annotation.id}:${annotation.revision}:${c.participantId}`,
      annotation
    );
    await c.client.mutation(api.collaboration.write, {
      ciphertext,
      expectedRevision: annotation.revision - 1,
      key: annotation.id,
      kind: "annotation",
      operationId: crypto.randomUUID(),
      proof: c.proof,
      roomId: c.roomId,
      sessionProof: c.sessionProof,
    });
    return annotation.id;
  }
  const updateProfile = useCallback(async (profile: CollaboratorProfile) => {
    const c = connectionRef.current;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: the connection can close between renders
    if (!c) {
      return;
    }
    try {
      const parsed = parseProfile(profile);
      const rows = await c.client.query(api.collaboration.profiles, {
        proof: c.proof,
        roomId: c.roomId,
      });
      const own = rows.find((row) => row.participantId === c.participantId);
      if (!own) {
        return;
      }
      const previous = parseProfile(
        await decryptRoomValue(c.secret, "profile", own.profileCipher)
      );
      if (
        previous.character === parsed.character &&
        previous.name === parsed.name
      ) {
        return;
      }
      await c.client.mutation(api.collaboration.updateProfile, {
        expectedRevision: own.revision,
        profileCipher: await encryptRoomValue(c.secret, "profile", parsed),
        proof: c.proof,
        roomId: c.roomId,
        sessionProof: c.sessionProof,
      });
    } catch (failure) {
      setError(message(failure));
    }
  }, []);
  async function saveDocument(html: string, expectedRevision: number) {
    const c = connectionRef.current;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: actions can race the asynchronous disconnect cleanup
    if (!c) {
      throw new Error("Open a collaboration invitation first.");
    }
    const draft = await sharedDocument(targetRef.current, html);
    const ciphertext = await encryptRoomValue(
      c.secret,
      `${c.roomId}:document:${expectedRevision + 1}:${c.participantId}`,
      draft
    );
    return c.client.mutation(api.collaboration.write, {
      ciphertext,
      expectedRevision,
      key: "document",
      kind: "document",
      operationId: crypto.randomUUID(),
      proof: c.proof,
      roomId: c.roomId,
      sessionProof: c.sessionProof,
    });
  }
  function moveCursor(anchor: AnnotationAnchor, click = false) {
    const c = connectionRef.current;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: cursor events can outlive the connection
    if (!c || (!click && Date.now() - lastCursor.current < 250)) {
      return;
    }
    lastCursor.current = Date.now();
    const value = {
      anchor: parseAnchor(anchor),
      event: click ? "click" : "move",
      target: activeTargetRef.current,
    };
    // Serialize encryption + writes so a slower movement cannot overwrite a later click.
    cursorQueue.current = cursorQueue.current
      .then(async () => {
        if (connectionRef.current !== c) {
          return;
        }
        const ciphertext = await encryptRoomValue(
          c.secret,
          `${c.roomId}:cursor:${c.sessionId}`,
          value
        );
        await c.client.mutation(api.collaboration.moveCursor, {
          ciphertext,
          click,
          proof: c.proof,
          roomId: c.roomId,
          sessionProof: c.sessionProof,
        });
      })
      .catch((failure) => setError(message(failure)));
  }
  return {
    activeTarget,
    annotations,
    configured: !!url,
    connecting,
    connection,
    contributorCount,
    cursors,
    documentDraft,
    documentRevision,
    error,
    moveCursor,
    online,
    profiles,
    saveAnnotation,
    saveDocument,
    sequence,
    start,
    updateProfile,
  };
}

export type CollaborationState = ReturnType<typeof useCollaboration>;
