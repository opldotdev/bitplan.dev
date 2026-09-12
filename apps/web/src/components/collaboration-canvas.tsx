"use client";

import {
  Copy,
  ImagePlus,
  Link,
  MessageSquare,
  Plus,
  Type,
  X,
} from "lucide-react";
import Image from "next/image";
import { ContextMenu } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AnnotationCard } from "@/components/annotation-card";
import { AnnotationImagePicker } from "@/components/annotation-image-picker";
import { AnnotationOnboarding } from "@/components/annotation-onboarding";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { registerWebMcpTool } from "@/components/webmcp-tools";
import { withAnnotationBridge } from "@/lib/annotation-bridge";
import { annotationInputAction } from "@/lib/annotation-input";
import { annotationLink } from "@/lib/annotation-link";
import { annotationCardOffset } from "@/lib/annotation-position";
import {
  type Annotation,
  type AnnotationAnchor,
  type AnnotationContent,
  type DocumentTarget,
  parseAnchor,
  parseAnnotationContent,
  sameDocumentTarget,
} from "@/lib/annotations";
import { characterPortrait } from "@/lib/collaborator";
import { cursorIsActive } from "@/lib/cursor-activity";
import { isHostedId } from "@/lib/hosted-id";
import { withRenderPolicy } from "@/lib/render-policy";
import type { CollaborationState } from "@/lib/use-collaboration";

const center: AnnotationAnchor = { point: { x: 0.5, y: 0.1 } };
const menuItem =
  "flex cursor-default items-center gap-1 rounded-sm px-2 py-2 text-sm outline-none data-highlighted:bg-muted data-disabled:opacity-50 [&_svg]:size-4";
const CONTEXT_LINK = /^(https?:\/\/|mailto:|#)/i;
type AnnotationMode = "text" | "html" | "image";

function contentFor(
  mode: AnnotationMode,
  text: string,
  image: string | null
): AnnotationContent {
  if (mode === "html") {
    if (!text.trim()) {
      throw new Error("Write something first.");
    }
    return { html: text, type: "html" };
  }
  if (mode === "image") {
    if (!image) {
      throw new Error("Choose an image first.");
    }
    return { alt: text, dataUrl: image, type: "image" };
  }
  if (!text.trim()) {
    throw new Error("Write something first.");
  }
  return { text, type: "text" };
}

function annotationInputLabel(mode: AnnotationMode): string {
  if (mode === "html") {
    return "Annotation HTML";
  }
  if (mode === "image") {
    return "Image description";
  }
  return "Comment";
}

function AnnotationAttachmentStatus({
  item,
  target,
  position: annotationPosition,
}: {
  item: Annotation;
  target: DocumentTarget;
  position: { x: number; y: number } | null | undefined;
}) {
  if (!sameDocumentTarget(item.target, target)) {
    return (
      <p className="text-muted-foreground text-xs">
        Attached to earlier content in version {item.target.version}. This note
        has not been moved.
      </p>
    );
  }
  if (annotationPosition === null) {
    return <p className="text-muted-foreground text-xs">Needs reattachment</p>;
  }
  return null;
}

const position = (value: unknown): value is { x: number; y: number } =>
  !!value &&
  typeof value === "object" &&
  "x" in value &&
  "y" in value &&
  typeof value.x === "number" &&
  typeof value.y === "number" &&
  Number.isFinite(value.x) &&
  Number.isFinite(value.y) &&
  Math.abs(value.x) < 100_000 &&
  Math.abs(value.y) < 100_000;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: this component is the single orchestration boundary for iframe geometry and encrypted annotation UI state
export function CollaborationCanvas({
  html,
  title,
  target,
  room,
}: {
  html: string;
  title: string;
  target: DocumentTarget;
  room: CollaborationState;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const connectedFrame = useRef<HTMLIFrameElement | null>(null);
  const geometryPort = useRef<MessagePort | null>(null);
  const [bridgeHostReady, setBridgeHostReady] = useState(false);
  const trigger = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState(false);
  const [anchor, setAnchor] = useState<AnnotationAnchor>(center);
  const [contextLink, setContextLink] = useState<string | null>(null);
  const [contextSelection, setContextSelection] = useState("");
  const [mode, setMode] = useState<AnnotationMode>("text");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inline, setInline] = useState<{
    anchor: AnnotationAnchor;
    target: DocumentTarget;
    text: string;
    image?: string;
    kind?: "image";
  } | null>(null);
  const inlineInput = useRef<HTMLTextAreaElement>(null);
  const [editor, setEditor] = useState<{
    html: string;
    revision: number;
  } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingDocument, setSavingDocument] = useState(false);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number } | null>
  >({});
  const [activityTime, setActivityTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setActivityTime(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const roomRef = useRef(room);
  roomRef.current = room;
  const currentHtml =
    room.documentDraft && sameDocumentTarget(room.documentDraft.base, target)
      ? room.documentDraft.html
      : html;
  const htmlRef = useRef(currentHtml);
  htmlRef.current = currentHtml;
  const documentHtml = useMemo(
    () => withAnnotationBridge(currentHtml, !!room.connection),
    [currentHtml, !!room.connection]
  );
  const visible = room.annotations.filter(
    (item) =>
      sameDocumentTarget(item.target, room.activeTarget) &&
      item.status === "open"
  );
  const earlierCursors = room.cursors.filter(
    (cursor) => !sameDocumentTarget(cursor.target, room.activeTarget)
  );
  const targets = [
    ...visible.map((item) => ({ anchor: item.anchor, id: item.id })),
    ...(inline ? [{ anchor: inline.anchor, id: "composer" }] : []),
    ...room.cursors
      .filter((item) => sameDocumentTarget(item.target, room.activeTarget))
      .map((item) => ({ anchor: item.anchor, id: `cursor-${item.sessionId}` })),
  ];
  const targetsJson = JSON.stringify(targets);
  const targetsJsonRef = useRef(targetsJson);
  targetsJsonRef.current = targetsJson;

  function locate() {
    geometryPort.current?.postMessage({
      payload: JSON.parse(targetsJsonRef.current),
      type: "anchors",
    });
  }
  function cardTransform(
    point: { x: number; y: number },
    width: number,
    height: number
  ) {
    const offset = annotationCardOffset(
      point,
      {
        height: frame.current?.clientHeight ?? 0,
        width: frame.current?.clientWidth ?? 0,
      },
      { height, width }
    );
    return `translate(${offset.x}px, ${offset.y}px)`;
  }
  useEffect(() => {
    locate();
  }, [targetsJson, documentHtml]);
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the private-port receiver validates each supported message shape before updating UI state
  function received(event: MessageEvent) {
    try {
      if (event.data.type === "context") {
        const { payload } = event.data;
        if (!(position(payload) && "anchor" in payload)) {
          return;
        }
        setAnchor(parseAnchor(payload.anchor));
        setContextSelection(
          "selection" in payload &&
            typeof payload.selection === "string" &&
            payload.selection.length <= 32_000
            ? payload.selection
            : ""
        );
        setContextLink(
          "href" in payload &&
            typeof payload.href === "string" &&
            payload.href.length <= 8192 &&
            CONTEXT_LINK.test(payload.href)
            ? payload.href
            : null
        );
        const bounds = frame.current?.getBoundingClientRect();
        if (
          bounds &&
          payload.x >= 0 &&
          payload.y >= 0 &&
          payload.x <= bounds.width &&
          payload.y <= bounds.height
        ) {
          trigger.current?.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              clientX: bounds.left + payload.x,
              clientY: bounds.top + payload.y,
            })
          );
        }
      } else if (event.data.type === "pointer" || event.data.type === "click") {
        roomRef.current.moveCursor(
          parseAnchor(event.data.payload?.anchor),
          event.data.type === "click"
        );
      } else if (
        event.data.type === "positions" &&
        Array.isArray(event.data.payload) &&
        event.data.payload.length <= 1600
      ) {
        const next: Record<string, { x: number; y: number } | null> = {};
        for (const row of event.data.payload) {
          if (
            typeof row?.id === "string" &&
            row.id.length <= 160 &&
            (row.position === null || position(row.position))
          ) {
            next[row.id] = row.position;
          }
        }
        setPositions(next);
      }
    } catch {
      /* Reject malformed messages from the untrusted document. */
    }
  }

  useEffect(() => {
    function acceptGeometryPort(event: MessageEvent) {
      const currentFrame = frame.current;
      const [port] = event.ports;
      if (
        event.source !== currentFrame?.contentWindow ||
        event.data?.type !== "bitplan-geometry-ready/1" ||
        !port
      ) {
        return;
      }
      if (connectedFrame.current === currentFrame) {
        port.close();
        return;
      }
      connectedFrame.current = currentFrame;
      geometryPort.current?.close();
      geometryPort.current = port;
      port.addEventListener("message", received);
      port.start();
      locate();
    }
    window.addEventListener("message", acceptGeometryPort);
    setBridgeHostReady(true);
    return () => {
      window.removeEventListener("message", acceptGeometryPort);
      geometryPort.current?.close();
      geometryPort.current = null;
      connectedFrame.current = null;
    };
  }, []);

  useEffect(() => {
    if (!room.connection) {
      return;
    }
    const cleanups = [
      registerWebMcpTool({
        description:
          "Read decrypted annotations and the latest observed change cursor for the collaboration already open in this tab. Never returns invitation or wallet secrets.",
        execute: () => ({
          annotations: roomRef.current.annotations,
          collaborators: roomRef.current.profiles,
          cursor: roomRef.current.sequence,
          documentRevision: roomRef.current.documentRevision,
          html: htmlRef.current,
          locations: roomRef.current.cursors,
          online: roomRef.current.online,
          target: roomRef.current.activeTarget,
        }),
        inputSchema: {
          additionalProperties: false,
          properties: {},
          type: "object",
        },
        name: "read_bitplan_collaboration",
        title: "Read live BitPlan annotations",
      }),
      registerWebMcpTool({
        description:
          "Add an encrypted hosted annotation to the current document version as this tab’s participant. Accepts text, isolated HTML, or an embedded raster/SVG image. Does not publish a transaction.",
        execute: async (input: unknown) => {
          if (
            !input ||
            typeof input !== "object" ||
            !("anchor" in input) ||
            !("content" in input)
          ) {
            throw new Error("Provide anchor and content.");
          }
          return {
            annotationId: await roomRef.current.saveAnnotation(
              parseAnnotationContent(input.content),
              parseAnchor(input.anchor)
            ),
          };
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            anchor: {
              description:
                "Optional elementId or quote, and normalized point {x,y}.",
              type: "object",
            },
            content: {
              description:
                "{type:'text',text} or {type:'html',html} or {type:'image',dataUrl,alt}.",
              type: "object",
            },
          },
          required: ["anchor", "content"],
          type: "object",
        },
        name: "annotate_bitplan",
        title: "Annotate this BitPlan",
      }),
      registerWebMcpTool({
        description:
          "Save shared HTML against the documentRevision returned by read_bitplan_collaboration. Conflicts reject stale edits. No wallet action or inscription. Hosted plans only.",
        execute: (input: unknown) => {
          if (
            !input ||
            typeof input !== "object" ||
            !("html" in input) ||
            typeof input.html !== "string" ||
            !("expectedRevision" in input) ||
            typeof input.expectedRevision !== "number" ||
            !Number.isSafeInteger(input.expectedRevision) ||
            input.expectedRevision < 0
          ) {
            throw new Error("Provide HTML and the observed document revision.");
          }
          return roomRef.current.saveDocument(
            input.html,
            input.expectedRevision
          );
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            expectedRevision: { minimum: 0, type: "integer" },
            html: { type: "string" },
          },
          required: ["html", "expectedRevision"],
          type: "object",
        },
        name: "edit_bitplan_document",
        title: "Edit the hosted BitPlan",
      }),
    ];
    return () => {
      for (const cleanup of cleanups) {
        cleanup?.();
      }
    };
  }, [room.connection]);

  async function save() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const content = contentFor(mode, text, image);
      await room.saveAnnotation(content, anchor);
      setText("");
      setImage(null);
      if (mode === "text") {
        setPanel(false);
      }
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Could not save annotation."
      );
    } finally {
      setBusy(false);
    }
  }
  async function resolve(item: Annotation) {
    try {
      await room.saveAnnotation(item.content, item.anchor, {
        ...item,
        status: item.status === "open" ? "resolved" : "open",
      });
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Could not update annotation."
      );
    }
  }
  async function saveInline() {
    if (
      busy ||
      !inline ||
      (inline.kind === "image" ? !inline.image : !inline.text.trim())
    ) {
      return;
    }
    setBusy(true);
    try {
      if (!sameDocumentTarget(inline.target, room.activeTarget)) {
        throw new Error(
          "The document changed. Copy your note and choose its position again."
        );
      }
      await room.saveAnnotation(
        inline.kind === "image" && inline.image
          ? { alt: inline.text, dataUrl: inline.image, type: "image" }
          : { text: inline.text, type: "text" },
        inline.anchor
      );
      setInline(null);
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Could not save annotation."
      );
    } finally {
      setBusy(false);
    }
  }

  function handleInlineKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (!inline) {
      return;
    }
    if (inline.kind !== "image") {
      const action = annotationInputAction(event);
      if (!action) {
        return;
      }
      event.preventDefault();
      if (busy) {
        return;
      }
      if (action === "cancel") {
        setInline(null);
      } else {
        void saveInline();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void saveInline();
    }
  }

  function editDocument() {
    setEditor({ html: currentHtml, revision: room.documentRevision });
    setEditError(null);
  }
  async function saveDocument() {
    if (!editor) {
      return;
    }
    setSavingDocument(true);
    try {
      await room.saveDocument(editor.html, editor.revision);
      setEditor(null);
      setEditError(null);
    } catch (failure) {
      setEditError(
        failure instanceof Error
          ? failure.message
          : "Could not save. Your edits are retained."
      );
    } finally {
      setSavingDocument(false);
    }
  }

  return (
    <>
      {room.connection ? <AnnotationOnboarding /> : null}
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild disabled={!room.connection}>
          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            data-bitplan-connected={room.connection ? room.online : undefined}
            data-bitplan-sequence={room.connection ? room.sequence : undefined}
            onContextMenuCapture={(event) => {
              if (event.target === event.currentTarget) {
                return; // Geometry bridge's positioned menu event.
              }
              event.stopPropagation();
              if ((event.target as Element).closest("form,aside,button")) {
                return;
              }
              event.preventDefault();
              const bounds = frame.current?.getBoundingClientRect();
              if (bounds) {
                geometryPort.current?.postMessage({
                  payload: {
                    x: event.clientX - bounds.left,
                    y: event.clientY - bounds.top,
                  },
                  type: "point",
                });
              }
            }}
            ref={trigger}
          >
            {bridgeHostReady ? (
              <iframe
                className="absolute inset-0 h-full w-full border-0 bg-background"
                key={documentHtml}
                ref={frame}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                srcDoc={documentHtml}
                title={title}
              />
            ) : null}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {targets
                .filter((item) => !item.id.startsWith("cursor-"))
                .map((item) => {
                  const point = positions[item.id];
                  return point ? (
                    <span
                      aria-hidden="true"
                      className="absolute z-10 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
                      key={`pin-${item.id}`}
                      style={{ left: point.x, top: point.y }}
                    />
                  ) : null;
                })}
              {visible.map((item, index) => {
                const point = positions[item.id];
                if (!point) {
                  return null;
                }
                return (
                  <AnnotationCard
                    canResize={
                      item.participantId === room.connection?.participantId
                    }
                    item={item}
                    key={item.id}
                    label={`Annotation ${index + 1}`}
                    save={(size) =>
                      room.saveAnnotation(item.content, item.anchor, {
                        ...item,
                        size,
                      })
                    }
                    style={{
                      left: point.x,
                      top: point.y,
                      transform: cardTransform(
                        point,
                        item.size?.width ?? 224,
                        item.size?.height ?? 120
                      ),
                    }}
                  >
                    <button
                      className="mb-1 block text-muted-foreground text-xs"
                      onClick={() => setPanel(true)}
                      type="button"
                    >
                      {room.profiles[item.participantId]?.name ??
                        "Collaborator"}{" "}
                      · {index + 1}
                    </button>
                    <AnnotationBody content={item.content} />
                  </AnnotationCard>
                );
              })}
              {room.cursors
                .filter((cursor) =>
                  sameDocumentTarget(cursor.target, room.activeTarget)
                )
                .map((cursor) => {
                  const point = positions[`cursor-${cursor.sessionId}`];
                  const profile = room.profiles[cursor.participantId];
                  if (!profile) {
                    return null;
                  }
                  const width = frame.current?.clientWidth ?? 0;
                  const height = frame.current?.clientHeight ?? 0;
                  const active = cursorIsActive(
                    cursor.online,
                    cursor.updatedAt,
                    activityTime
                  );
                  const onPage =
                    point &&
                    point.x >= 0 &&
                    point.y >= 0 &&
                    point.x < width &&
                    point.y < height;
                  const hue =
                    [...cursor.sessionId].reduce(
                      (sum, char) => sum + char.charCodeAt(0),
                      0
                    ) % 360;
                  return (
                    <div
                      className="absolute flex max-w-64 items-center gap-1 text-xs"
                      data-collaborator-location={cursor.sessionId}
                      key={cursor.sessionId}
                      style={{
                        color: `hsl(${hue} 70% 65%)`,
                        left: onPage
                          ? Math.max(0, Math.min(point.x, width - 180))
                          : 8,
                        top: onPage
                          ? Math.max(0, Math.min(point.y, height - 40))
                          : 8 + room.cursors.indexOf(cursor) * 32,
                      }}
                      title={`Last location: ${new Date(cursor.updatedAt).toLocaleString()} · ${cursor.clickCount} clicks`}
                    >
                      <span
                        aria-hidden="true"
                        className={active ? "" : "invisible"}
                      >
                        ↖
                      </span>
                      <Image
                        alt=""
                        className="shrink-0 rounded-full border-2"
                        height={24}
                        referrerPolicy="no-referrer"
                        src={characterPortrait(profile.character)}
                        style={{ height: 24, width: 24 }}
                        unoptimized
                        width={24}
                      />
                      <span className="rounded bg-background px-1 py-0.5">
                        {profile.name}
                        {cursor.kind === "agent" ? " · Agent" : ""} ·{" "}
                        {cursor.online ? "connected" : "last seen"}
                        {onPage ? "" : " · offscreen"}
                      </span>
                    </div>
                  );
                })}
            </div>
            {earlierCursors.length > 0 ? (
              <details
                aria-label="Earlier-version collaborators"
                className="absolute top-2 left-2 z-10 rounded-lg bg-background/90 p-1 text-xs"
              >
                <summary
                  className="flex cursor-pointer list-none items-center -space-x-2"
                  title="Last seen on earlier versions"
                >
                  {earlierCursors.slice(0, 4).map((cursor) => {
                    const profile = room.profiles[cursor.participantId];
                    return profile ? (
                      <Image
                        alt={profile.name}
                        className="shrink-0 rounded-full border-2 border-background"
                        height={24}
                        key={cursor.sessionId}
                        referrerPolicy="no-referrer"
                        src={characterPortrait(profile.character)}
                        style={{ height: 24, width: 24 }}
                        title={profile.name}
                        unoptimized
                        width={24}
                      />
                    ) : null;
                  })}
                  <span className="grid size-6 place-items-center rounded-full border bg-background">
                    {earlierCursors.length}
                  </span>
                </summary>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto p-1">
                  {earlierCursors.map((cursor) => (
                    <p key={cursor.sessionId}>
                      {room.profiles[cursor.participantId]?.name ??
                        "Collaborator"}
                      {cursor.kind === "agent" ? " · Agent" : ""} · earlier
                      version
                    </p>
                  ))}
                </div>
              </details>
            ) : null}
            {inline && positions.composer ? (
              <form
                aria-label="Add Annotation"
                className="absolute z-30 w-64 max-w-[90vw] space-y-2 rounded-md border bg-background p-2 shadow-md"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveInline();
                }}
                style={{
                  left: positions.composer.x,
                  top: positions.composer.y,
                  transform: cardTransform(positions.composer, 256, 160),
                }}
              >
                {inline.kind === "image" ? (
                  <>
                    <AnnotationImagePicker
                      onLoad={(dataUrl) =>
                        setInline((value) =>
                          value ? { ...value, image: dataUrl } : null
                        )
                      }
                    />
                    {inline.image ? (
                      /* biome-ignore lint/performance/noImgElement lint/correctness/useImageSize: encrypted data URLs need their natural dimensions for an undistorted preview */
                      <img
                        alt="Selected preview"
                        className="max-h-40 max-w-full"
                        src={inline.image}
                      />
                    ) : null}
                  </>
                ) : null}
                <textarea
                  aria-label={
                    inline.kind === "image"
                      ? "Image description"
                      : "Annotation text"
                  }
                  autoFocus
                  className="min-h-20 w-full resize-y rounded border bg-background p-2 text-sm"
                  maxLength={inline.kind === "image" ? 2000 : 32_000}
                  onChange={(event) =>
                    setInline((value) =>
                      value ? { ...value, text: event.target.value } : null
                    )
                  }
                  onKeyDown={handleInlineKeyDown}
                  placeholder={
                    inline.kind === "image"
                      ? "Describe the image…"
                      : "Write an annotation…"
                  }
                  readOnly={busy}
                  ref={inlineInput}
                  value={inline.text}
                />
                {inline.kind === "image" ? (
                  <div className="flex justify-end gap-2">
                    <Button
                      disabled={busy}
                      onClick={() => setInline(null)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={
                        busy ||
                        (inline.kind === "image"
                          ? !inline.image
                          : !inline.text.trim())
                      }
                      size="sm"
                      type="submit"
                    >
                      {busy ? "Saving…" : "Save"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs" role="status">
                    {busy
                      ? "Saving…"
                      : "Enter to save · Shift+Enter for a new line · Esc to cancel"}
                  </p>
                )}
              </form>
            ) : null}
            {room.connection ? (
              <Button
                aria-controls="bitplan-annotations"
                aria-expanded={panel}
                className="absolute right-4 bottom-4 shadow-sm"
                onClick={() => setPanel((value) => !value)}
                size="sm"
                type="button"
                variant="outline"
              >
                <MessageSquare />
                Annotations · {visible.length}
              </Button>
            ) : null}
            {panel && room.connection ? (
              <aside
                aria-label="Live annotations"
                className="absolute inset-y-0 right-0 z-20 flex w-80 max-w-full flex-col border-l bg-background shadow-sm"
                data-bitplan-collaboration="live"
                id="bitplan-annotations"
              >
                <div className="flex items-center justify-between border-b p-3">
                  <div>
                    <h2 className="font-medium text-sm">Annotations</h2>
                    <p className="text-muted-foreground text-xs" role="status">
                      {room.online ? "Live · encrypted" : "Reconnecting…"} ·
                      change {room.sequence}
                    </p>
                  </div>
                  <Button
                    aria-label="Close annotations"
                    onClick={() => setPanel(false)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {isHostedId(target.origin) ? (
                    <Button onClick={editDocument} size="sm" variant="outline">
                      Edit shared document
                    </Button>
                  ) : null}
                  {room.documentDraft ? (
                    <p className="text-muted-foreground text-xs">
                      Hosted draft edit {room.documentDraft.revision} · not
                      published on chain
                    </p>
                  ) : null}
                  <section
                    aria-label="Collaborators"
                    className="flex flex-wrap gap-2"
                  >
                    {Object.entries(room.profiles).map(([id, profile]) => (
                      <span
                        className="flex items-center gap-1 text-xs"
                        key={id}
                      >
                        <Image
                          alt=""
                          className="shrink-0 rounded-full"
                          height={20}
                          referrerPolicy="no-referrer"
                          src={characterPortrait(profile.character)}
                          style={{ height: 20, width: 20 }}
                          unoptimized
                          width={20}
                        />
                        {profile.name}
                      </span>
                    ))}
                  </section>
                  {room.annotations.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Right-click anywhere on the plan to leave a note. Or add
                      one below.
                    </p>
                  ) : null}
                  {room.annotations.map((item) => (
                    <article
                      className="space-y-2 rounded-lg border p-3 text-sm"
                      data-annotation-id={item.id}
                      key={item.id}
                    >
                      <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
                        <span>
                          {room.profiles[item.participantId]?.name ??
                            "Collaborator"}
                        </span>
                        <span>{item.status}</span>
                      </div>
                      <AnnotationAttachmentStatus
                        item={item}
                        position={positions[item.id]}
                        target={room.activeTarget}
                      />
                      <AnnotationBody content={item.content} />
                      {item.participantId === room.connection?.participantId ? (
                        <Button
                          onClick={() => void resolve(item)}
                          size="sm"
                          variant="ghost"
                        >
                          {item.status === "open" ? "Resolve" : "Reopen"}
                        </Button>
                      ) : null}
                    </article>
                  ))}
                </div>
                <form
                  className="space-y-2 border-t p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                  }}
                >
                  <label className="flex items-center justify-between text-xs">
                    Add annotation
                    <select
                      className="rounded border bg-background p-1"
                      onChange={(event) =>
                        setMode(event.target.value as typeof mode)
                      }
                      value={mode}
                    >
                      <option value="text">Comment</option>
                      <option value="html">HTML</option>
                      <option value="image">Image</option>
                    </select>
                  </label>
                  {mode === "image" ? (
                    <AnnotationImagePicker onLoad={setImage} />
                  ) : null}
                  <textarea
                    aria-label={annotationInputLabel(mode)}
                    className="min-h-24 w-full resize-y rounded-md border bg-background p-2 text-sm"
                    maxLength={mode === "html" ? 200_000 : 32_000}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                      if (mode !== "text") {
                        return;
                      }
                      const action = annotationInputAction(event);
                      if (!action) {
                        return;
                      }
                      event.preventDefault();
                      if (busy) {
                        return;
                      }
                      if (action === "cancel") {
                        setPanel(false);
                      } else if (text.trim()) {
                        void save();
                      }
                    }}
                    placeholder={
                      mode === "html" ? "<p>Your HTML…</p>" : "Leave a note…"
                    }
                    readOnly={busy}
                    value={text}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      Hosted only · no transaction
                    </span>
                    {mode === "text" ? (
                      <span
                        className="text-muted-foreground text-xs"
                        role="status"
                      >
                        {busy
                          ? "Saving…"
                          : "Enter to save · Shift+Enter for newline"}
                      </span>
                    ) : (
                      <Button disabled={busy} size="sm" type="submit">
                        {busy ? "Saving…" : "Add"}
                      </Button>
                    )}
                  </div>
                </form>
              </aside>
            ) : null}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            aria-label="Annotation tools"
            className="z-50 flex gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              inlineInput.current?.focus();
            }}
          >
            <ContextMenu.Item
              aria-label="Add text annotation"
              className={menuItem}
              disabled={busy || !!inline}
              onSelect={() => {
                setPanel(false);
                setInline({ anchor, target: room.activeTarget, text: "" });
              }}
              title="Add text annotation"
            >
              <Plus />
              <Type />
            </ContextMenu.Item>
            <ContextMenu.Item
              aria-label="Add image annotation"
              className={menuItem}
              disabled={busy || !!inline}
              onSelect={() => {
                setPanel(false);
                setInline({
                  anchor,
                  kind: "image",
                  target: room.activeTarget,
                  text: "",
                });
              }}
              title="Add image or SVG"
            >
              <ImagePlus />
            </ContextMenu.Item>
            {contextSelection ? (
              <ContextMenu.Item
                aria-label="Copy selected text"
                className={menuItem}
                onSelect={() => {
                  void navigator.clipboard.writeText(contextSelection).then(
                    () => toast.success("Text copied"),
                    () =>
                      toast.error(
                        "Could not copy text. Clipboard access was denied."
                      )
                  );
                }}
                title="Copy selected text"
              >
                <Copy />
              </ContextMenu.Item>
            ) : null}
            {contextLink ? (
              <ContextMenu.Item
                aria-label="Copy link"
                className={menuItem}
                onSelect={() => {
                  void navigator.clipboard.writeText(contextLink).then(
                    () => toast.success("Link copied"),
                    () =>
                      toast.error(
                        "Could not copy link. Clipboard access was denied."
                      )
                  );
                }}
                title="Copy link"
              >
                <Link />
              </ContextMenu.Item>
            ) : null}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <Dialog
        onOpenChange={(open) => {
          if (!(open || savingDocument)) {
            setEditor(null);
          }
        }}
        open={!!editor}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle>Edit shared document</DialogTitle>
          <DialogDescription>
            Save sends this HTML to every collaborator. It does not publish a
            transaction. Newer edits reject a stale save.
          </DialogDescription>
          <textarea
            aria-label="Plan HTML"
            className="min-h-80 w-full rounded-md border bg-background p-3 font-mono text-xs"
            onChange={(event) =>
              setEditor((value) =>
                value ? { ...value, html: event.target.value } : null
              )
            }
            value={editor?.html ?? ""}
          />
          <p className="text-muted-foreground text-xs">
            Editing revision {editor?.revision ?? 0} · latest{" "}
            {room.documentDraft?.revision ?? 0}
          </p>
          {editError ? (
            <p className="text-destructive text-sm" role="alert">
              {editError} Your editor contents are retained. Copy them before
              loading the latest version.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              disabled={savingDocument}
              onClick={editDocument}
              variant="outline"
            >
              Discard mine &amp; load latest
            </Button>
            <Button
              disabled={savingDocument}
              onClick={() => void saveDocument()}
            >
              {savingDocument ? "Saving…" : "Save shared document"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AnnotationBody({ content }: { content: AnnotationContent }) {
  if (content.type === "text") {
    const href = annotationLink(content.text);
    if (href) {
      return (
        <a
          className="block break-words underline underline-offset-4"
          href={href}
          referrerPolicy="no-referrer"
          rel="noopener noreferrer"
          target="_blank"
        >
          {content.text}
        </a>
      );
    }
    return <p className="whitespace-pre-wrap break-words">{content.text}</p>;
  }
  if (content.type === "image") {
    return (
      /* biome-ignore lint/performance/noImgElement lint/correctness/useImageSize: encrypted annotation images need their natural dimensions to preserve arbitrary aspect ratios */
      <img
        alt={content.alt}
        className="h-auto w-full rounded"
        src={content.dataUrl}
      />
    );
  }
  if (content.type === "html") {
    return (
      <iframe
        className="h-48 w-full rounded border"
        sandbox=""
        srcDoc={withRenderPolicy(content.html)}
        title="HTML annotation"
      />
    );
  }
  return (
    <svg aria-label="Drawing annotation" role="img" viewBox="0 0 100 100">
      {content.strokes.map((stroke, index) => (
        <polyline
          fill="none"
          key={index}
          points={stroke
            .map((point) => `${point.x * 100},${point.y * 100}`)
            .join(" ")}
          stroke="currentColor"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}
