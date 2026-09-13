"use client";

import {
  Copy,
  ImagePlus,
  Link,
  PenTool,
  Plus,
  Settings,
  Shapes,
  Trash2,
  Type,
} from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { ContextMenu } from "radix-ui";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AnnotationCard } from "@/components/annotation-card";
import { AnnotationDrawLayer } from "@/components/annotation-draw-layer";
import { AnnotationImagePicker } from "@/components/annotation-image-picker";
import { AnnotationOnboarding } from "@/components/annotation-onboarding";
import { AnnotationThread } from "@/components/annotation-thread";
import { DocumentEditSummary } from "@/components/document-edit-summary";
import { PlanAccessPanel } from "@/components/plan-access-panel";
import { PlanSettings } from "@/components/plan-settings";
import { ReviewAuthor } from "@/components/review-author";
import { useRevisionSharing } from "@/components/revision-sharing";
import { usePlanAppearance } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSidebar } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { registerWebMcpTool } from "@/components/webmcp-tools";
import { withAnnotationBridge } from "@/lib/annotation-bridge";
import { annotationInputAction } from "@/lib/annotation-input";
import { annotationLink } from "@/lib/annotation-link";
import { annotationCardOffset } from "@/lib/annotation-position";
import { annotationShortcut } from "@/lib/annotation-shortcut";
import { annotationReplies, contributionOrder } from "@/lib/annotation-thread";
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
import {
  cursorIsActive,
  cursorStatus,
  cursorTimeAgo,
} from "@/lib/cursor-activity";
import type { DrawingTool } from "@/lib/drawing-asset";
import { isHostedId } from "@/lib/hosted-id";
import {
  activeReviewEdits,
  materializeTextBlocks,
  parseTextBlock,
  type TextBlock,
} from "@/lib/inline-text";
import { planAppearanceCss } from "@/lib/plan-appearance";
import {
  annotationPublicationPrompt,
  revisionSelectionPrompt,
} from "@/lib/plan-authority";
import { planPassages, planSections } from "@/lib/plan-sections";
import { printPlan } from "@/lib/print-plan";
import { withRenderPolicy } from "@/lib/render-policy";
import type { CollaborationState } from "@/lib/use-collaboration";

const center: AnnotationAnchor = { point: { x: 0.5, y: 0.1 } };
const menuItem =
  "flex cursor-default items-center gap-1 rounded-sm px-2 py-2 text-sm outline-none data-highlighted:bg-muted data-disabled:opacity-50 [&_svg]:size-4";
const CONTEXT_LINK = /^(https?:\/\/|mailto:|#)/i;
interface AnchorPosition {
  bounds?: { x: number; y: number; width: number; height: number };
  x: number;
  y: number;
}
const sessionColor = (id: string) =>
  `hsl(${[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360} 70% 65%)`;

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
  isPublisher = false,
  onSaveHosted,
  settingsOpen,
  onSettingsOpenChange,
  settingsDetails,
}: {
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  settingsDetails: ReactNode;
  html: string;
  title: string;
  target: DocumentTarget;
  room: CollaborationState;
  isPublisher?: boolean;
  onSaveHosted?: (html: string, assertCurrent: () => void) => Promise<void>;
}) {
  const { preset } = usePlanAppearance();
  const sharing = useRevisionSharing();
  const draftingRevision = isPublisher;
  const [savingHosted, setSavingHosted] = useState(false);
  const reviewEdits = activeReviewEdits(room.textEdits, room.textBlocks);
  const { resolvedTheme } = useTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  const connectedFrame = useRef<HTMLIFrameElement | null>(null);
  const geometryPort = useRef<MessagePort | null>(null);
  const [viewScale, setViewScale] = useState(1);
  const [toolsOpen, setToolsOpen] = useState(false);
  const shiftHeld = useRef(false);
  const viewportPan = useRef<{ x: number; y: number } | null>(null);
  const textPort = useRef<MessagePort | null>(null);
  const textRecovery = useRef(
    new Map<string, TextBlock & { revision: number }>()
  );
  const [inlineEditing, setInlineEditing] = useState(() =>
    isHostedId(target.origin)
  );
  const [inlineEditError, setInlineEditError] = useState<string | null>(null);
  const inlineEditingRef = useRef(inlineEditing);
  inlineEditingRef.current = inlineEditing;
  const [bridgeHostReady, setBridgeHostReady] = useState(false);
  const trigger = useRef<HTMLDivElement>(null);
  const {
    open: sidebarOpen,
    openMobile,
    isMobile,
    setOpen,
    setOpenMobile,
  } = useSidebar();
  const panel = isMobile ? openMobile : sidebarOpen;
  const setPanel = (open: boolean) => {
    (isMobile ? setOpenMobile : setOpen)(open);
    if (!open) {
      onSettingsOpenChange(false);
    }
  };
  const [browserMenu, setBrowserMenu] = useState(false);
  const selectedAnnotation = useRef<string | null>(null);
  const removedAnnotations = useRef<Annotation[]>([]);
  const annotationActionBusy = useRef(false);
  const [publishSection, setPublishSection] = useState("Review changes");
  const preferenceSection = [
    "Interaction",
    "Appearance",
    "Sound",
    "Document details",
  ].includes(publishSection);
  useEffect(() => {
    if (settingsOpen) {
      setPublishSection("Review changes");
    }
  }, [settingsOpen]);
  useEffect(() => {
    if (panel) {
      setPublishSection("Review changes");
    }
  }, [panel]);
  useEffect(() => {
    try {
      setBrowserMenu(localStorage.getItem("bitplan.browser-menu") === "true");
    } catch {
      /* Device storage may be unavailable. */
    }
  }, []);
  function changeBrowserMenu(enabled: boolean) {
    setBrowserMenu(enabled);
    try {
      localStorage.setItem("bitplan.browser-menu", String(enabled));
    } catch {
      /* Still applies in this session. */
    }
  }
  const [showEdits, setShowEdits] = useState(true);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [revisionNotes, setRevisionNotes] = useState("");
  const [publishOnChain, setPublishOnChain] = useState(false);
  const showEditsRef = useRef(showEdits);
  showEditsRef.current = showEdits;
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  const [highlight, setHighlight] = useState<AnnotationAnchor | null>(null);
  const picker = useRef<"text" | "image">("text");
  const lastHover = useRef<AnnotationAnchor>(center);
  const [drawing, setDrawing] = useState<DrawingTool | null>(null);
  const [drawingColor, setDrawingColor] = useState("#b65c38");
  const resolveDrawingAnchor = useRef<
    ((anchor: AnnotationAnchor) => void) | null
  >(null);
  const [contextLink, setContextLink] = useState<string | null>(null);
  const [contextSelection, setContextSelection] = useState("");
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
    sequence: number;
  } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingDocument, setSavingDocument] = useState(false);
  const [positions, setPositions] = useState<
    Record<string, AnchorPosition | null>
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
      ? (room.documentDraft.html ?? html)
      : html;
  const htmlRef = useRef(currentHtml);
  htmlRef.current = currentHtml;
  const titleRef = useRef(title);
  titleRef.current = title;
  const print = sharing?.print;
  useEffect(() => {
    if (!print) {
      return;
    }
    print.current = (annotations) =>
      printPlan(
        {
          annotations: roomRef.current.annotations,
          blocks: roomRef.current.textBlocks,
          html: htmlRef.current,
          profiles: roomRef.current.profiles,
          target: roomRef.current.activeTarget,
          title: titleRef.current,
        },
        annotations
      );
    return () => {
      print.current = null;
    };
  }, [print]);
  const documentHtml = useMemo(
    () =>
      withAnnotationBridge(
        showEdits ? currentHtml : html,
        !!room.connection && showEdits,
        preset ? planAppearanceCss(preset) : "",
        browserMenu,
        target.origin
      ),
    [
      currentHtml,
      html,
      showEdits,
      !!room.connection,
      preset,
      browserMenu,
      target.origin,
    ]
  );
  useEffect(() => {
    textPort.current?.postMessage({ payload: inlineEditing, type: "mode" });
  }, [inlineEditing]);
  useEffect(() => {
    textPort.current?.postMessage({
      payload: room.textBlocks
        .filter((block) => sameDocumentTarget(block.base, room.activeTarget))
        .map((block) => ({
          color: sessionColor(block.sessionId),
          name: room.profiles[block.participantId]?.name ?? "Collaborator",
          other: block.participantId !== room.connection?.participantId,
          path: block.path,
        })),
      type: "attribution",
    });
  }, [room.textBlocks, room.profiles, room.connection, room.activeTarget]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (textRecovery.current.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  useEffect(() => {
    textPort.current?.postMessage({
      payload: room.textBlocks.filter((block) =>
        sameDocumentTarget(block.base, room.activeTarget)
      ),
      type: "blocks",
    });
  }, [room.textBlocks, room.activeTarget]);
  useEffect(() => {
    function sync() {
      const { current } = roomRef;
      const port = textPort.current;
      // biome-ignore lint/suspicious/noUnnecessaryConditions: iframe teardown clears this ref independently of message delivery
      if (!port) {
        return;
      }
      port.postMessage({
        payload: current.textBlocks
          .filter((block) =>
            sameDocumentTarget(block.base, current.activeTarget)
          )
          .map((block) => ({
            color: sessionColor(block.sessionId),
            name: current.profiles[block.participantId]?.name ?? "Collaborator",
            other: block.participantId !== current.connection?.participantId,
            path: block.path,
          })),
        type: "attribution",
      });
      port.postMessage({
        payload: inlineEditingRef.current,
        type: "mode",
      });
      port.postMessage({
        payload: current.textBlocks.filter((block) =>
          sameDocumentTarget(block.base, current.activeTarget)
        ),
        type: "blocks",
      });
    }
    function ready(event: MessageEvent) {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "bitplan-text-ready/1" ||
        !event.ports[0] ||
        textPort.current
      ) {
        return;
      }
      const [port] = event.ports;
      textPort.current = port;
      const base = roomRef.current.activeTarget;
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: private edit channel validates input and retains rejected local edits
      port.onmessage = async ({ data }) => {
        if (data?.type === "ready") {
          sync();
          const drafts = [...textRecovery.current.values()].filter((block) =>
            sameDocumentTarget(block.base, base)
          );
          if (drafts.length) {
            port.postMessage({ payload: drafts, type: "restore" });
          }
          if (textRecovery.current.size) {
            setInlineEditError(
              "Unsaved text has been kept. Copy it before loading the latest text."
            );
          }
          return;
        }
        if (data?.type === "error" && typeof data.payload === "string") {
          setInlineEditError(data.payload);
          return;
        }
        if (data?.type === "clean" && typeof data.payload?.path === "string") {
          const key = `${base.sha256}:${data.payload.path}`;
          if (
            textRecovery.current.get(key)?.text === data.payload.text &&
            !!textRecovery.current.get(key)?.deleted ===
              (data.payload.deleted === true)
          ) {
            textRecovery.current.delete(key);
          }
          return;
        }
        if (data?.type === "draft") {
          const value = data.payload;
          try {
            if (
              typeof value?.text !== "string" ||
              value.text.length > 64_000 ||
              !Number.isSafeInteger(value.revision) ||
              value.revision < 0
            ) {
              return;
            }
            const block = parseTextBlock({
              ...value,
              base,
              schema: "bitplan-text/1",
              text: value.text.slice(0, 16_000),
            });
            textRecovery.current.set(`${base.sha256}:${block.path}`, {
              ...block,
              revision: value.revision,
              text: value.text,
            });
          } catch {
            /* Invalid bridge messages cannot change the document. */
          }
          return;
        }
        if (data?.type !== "edit") {
          return;
        }
        const value = data.payload;
        try {
          const block = parseTextBlock({
            ...value,
            base,
            schema: "bitplan-text/1",
          });
          if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
            throw new Error("Invalid text revision.");
          }
          const saved = await roomRef.current.saveTextBlock(
            block,
            value.revision
          );
          const recoveryKey = `${base.sha256}:${block.path}`;
          if (
            textRecovery.current.get(recoveryKey)?.text === block.text &&
            !!textRecovery.current.get(recoveryKey)?.deleted === !!block.deleted
          ) {
            textRecovery.current.delete(recoveryKey);
          }
          port.postMessage({
            payload: {
              deleted: block.deleted === true,
              path: block.path,
              revision: saved.revision,
              text: block.text,
            },
            type: "saved",
          });
        } catch {
          port.postMessage({ payload: value?.path, type: "failed" });
          setInlineEditError(
            "This passage changed or could not save. Your text is still on the page. Copy it before loading the latest text."
          );
        }
      };
      port.start();
      sync();
    }
    window.addEventListener("message", ready);
    return () => {
      window.removeEventListener("message", ready);
      textPort.current?.close();
      textPort.current = null;
    };
  }, [documentHtml]);
  const visible = room.annotations.filter(
    (item) =>
      showEdits &&
      sameDocumentTarget(item.target, room.activeTarget) &&
      !item.replyTo &&
      item.status === "open"
  );
  const earlierCursors = room.cursors.filter(
    (cursor) => !sameDocumentTarget(cursor.target, room.activeTarget)
  );
  const targets = [
    ...(highlight ? [{ anchor: highlight, id: "highlight" }] : []),
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
  function startPicking(kind: "text" | "image" = "text") {
    if (!showEditsRef.current) {
      return;
    }
    textPort.current?.postMessage({ type: "clear-selection" });
    picker.current = kind;
    setPanel(false);
    setPicking(true);
    pickingRef.current = true;
    setHighlight(null);
    geometryPort.current?.postMessage({ payload: true, type: "pick" });
    frame.current?.focus();
  }
  function stopPicking() {
    const wasPicking = pickingRef.current;
    pickingRef.current = false;
    setPicking(false);
    setHighlight(null);
    geometryPort.current?.postMessage({ payload: false, type: "pick" });
    // biome-ignore lint/suspicious/noUnnecessaryConditions: this ref is set by a separate user-event callback
    if (wasPicking) {
      roomRef.current.moveCursor(lastHover.current, false, false, true);
    }
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
      if (
        event.data.type === "shift-held" &&
        typeof event.data.payload === "boolean"
      ) {
        shiftHeld.current = event.data.payload;
      } else if (event.data.type === "camera") {
        const scale = event.data.payload?.scale;
        if (typeof scale === "number" && scale >= 0.25 && scale <= 4) {
          setViewScale(scale);
          setToolsOpen(false);
        }
      } else if (event.data.type === "resolved-anchor") {
        resolveDrawingAnchor.current?.(parseAnchor(event.data.payload?.anchor));
      } else if (event.data.type === "hover-end") {
        setHighlight(null);
        roomRef.current.moveCursor(lastHover.current, false, false, true);
      } else if (event.data.type === "picked") {
        const picked = parseAnchor(event.data.payload?.anchor);
        stopPicking();
        roomRef.current.moveCursor(picked, true);
        setHighlight(picked);
        setInline({
          anchor: picked,
          target: roomRef.current.activeTarget,
          text: "",
          ...(picker.current === "image" ? { kind: "image" as const } : {}),
        });
      } else if (event.data.type === "pick-cancel") {
        stopPicking();
      } else if (event.data.type === "shortcut") {
        keyboardAction(event.data.payload);
      } else if (event.data.type === "context") {
        const { payload } = event.data;
        if (!(position(payload) && "anchor" in payload)) {
          return;
        }
        parseAnchor(payload.anchor);
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
        if (event.data.type === "click") {
          selectedAnnotation.current = null;
        }
        const hovered = parseAnchor(event.data.payload?.anchor);
        lastHover.current = hovered;
        if (event.data.payload?.selecting === true) {
          setHighlight(hovered);
        }
        roomRef.current.moveCursor(
          hovered,
          event.data.type === "click",
          event.data.payload?.selecting === true
        );
      } else if (
        event.data.type === "positions" &&
        Array.isArray(event.data.payload) &&
        event.data.payload.length <= 1600
      ) {
        const next: Record<string, AnchorPosition | null> = {};
        for (const row of event.data.payload) {
          if (
            typeof row?.id === "string" &&
            row.id.length <= 160 &&
            (row.position === null || position(row.position))
          ) {
            const bounds = row.position?.bounds;
            next[row.id] =
              row.position === null
                ? null
                : {
                    x: row.position.x,
                    y: row.position.y,
                    ...(position(bounds) &&
                    "width" in bounds &&
                    typeof bounds.width === "number" &&
                    "height" in bounds &&
                    typeof bounds.height === "number" &&
                    Number.isFinite(bounds.width) &&
                    Number.isFinite(bounds.height) &&
                    bounds.width >= 0 &&
                    bounds.height >= 0 &&
                    bounds.width < 100_000 &&
                    bounds.height < 100_000
                      ? {
                          bounds: {
                            height: bounds.height,
                            width: bounds.width,
                            x: bounds.x,
                            y: bounds.y,
                          },
                        }
                      : {}),
                  };
          }
        }
        setPositions(next);
      }
    } catch {
      /* Reject malformed messages from the untrusted document. */
    }
  }

  function keyboardAction(key: unknown) {
    if (!showEditsRef.current) {
      return;
    }
    if (key === "Escape" || key === "v") {
      selectedAnnotation.current = null;
      stopPicking();
      setDrawing(null);
      textPort.current?.postMessage({ type: "clear-selection" });
      if (key === "v" && isHostedId(target.origin)) {
        setInlineEditing(true);
      }
    } else if ((key === "t" || key === "i") && roomRef.current.connection) {
      startPicking(key === "t" ? "text" : "image");
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
      setViewScale(1);
      geometryPort.current?.close();
      geometryPort.current = port;
      port.addEventListener("message", received);
      port.start();
      locate();
    }
    window.addEventListener("message", acceptGeometryPort);
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: shared keyboard entry keeps trusted-input and ownership guards explicit
    function keyboardTools(event: KeyboardEvent) {
      if (!showEditsRef.current) {
        return;
      }
      if (event.isTrusted && event.key === "Escape" && !event.isComposing) {
        keyboardAction("Escape");
        return;
      }
      const shortcut = annotationShortcut(
        event,
        event.target instanceof Element &&
          !!event.target.closest(
            "input,textarea,select,[contenteditable],[role=dialog]"
          )
      );
      if (shortcut) {
        if (shortcut === "undo" && removedAnnotations.current.length) {
          event.preventDefault();
          void undoAnnotationRemoval();
          return;
        }
        if (shortcut === "remove" && selectedAnnotation.current) {
          const item = roomRef.current.annotations.find(
            (a) => a.id === selectedAnnotation.current
          );
          if (
            item &&
            sameDocumentTarget(item.target, roomRef.current.activeTarget) &&
            item.participantId === roomRef.current.connection?.participantId
          ) {
            event.preventDefault();
            void resolve(item);
            return;
          }
        }
      }
      if (
        !event.isTrusted ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        (event.target instanceof Element &&
          event.target.closest("input,textarea,select,[contenteditable]"))
      ) {
        return;
      }
      if (event.key === "Shift") {
        shiftHeld.current = true;
        geometryPort.current?.postMessage({ type: "open-tools" });
      } else {
        keyboardAction(event.key.toLowerCase());
      }
    }
    window.addEventListener("keydown", keyboardTools);
    function zoomOverOverlay(event: WheelEvent) {
      const element = event.target instanceof Element ? event.target : null;
      if (
        !(
          event.isTrusted &&
          (event.shiftKey || shiftHeld.current) &&
          element &&
          (trigger.current?.contains(element) ||
            element.closest("[data-plan-tools]"))
        )
      ) {
        return;
      }
      const bounds = frame.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }
      event.preventDefault();
      setToolsOpen(false);
      geometryPort.current?.postMessage({
        payload: {
          delta:
            (event.deltaY || event.deltaX) *
            ([1, 16, bounds.height][event.deltaMode] ?? 1),
          kind: "zoom",
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        },
        type: "navigate",
      });
    }
    window.addEventListener("wheel", zoomOverOverlay, {
      capture: true,
      passive: false,
    });
    function releaseShift(event: KeyboardEvent | Event) {
      if (event instanceof KeyboardEvent && event.key !== "Shift") {
        return;
      }
      shiftHeld.current = false;
      geometryPort.current?.postMessage({ type: "release-shift" });
    }
    window.addEventListener("keyup", releaseShift, true);
    window.addEventListener("blur", releaseShift);
    setBridgeHostReady(true);
    return () => {
      window.removeEventListener("message", acceptGeometryPort);
      window.removeEventListener("keydown", keyboardTools);
      window.removeEventListener("wheel", zoomOverOverlay, true);
      window.removeEventListener("keyup", releaseShift, true);
      window.removeEventListener("blur", releaseShift);
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
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        description:
          "Read decrypted annotations and the latest observed change cursor for the collaboration already open in this tab. Never returns invitation or wallet secrets.",
        execute: () => {
          roomRef.current.moveCursor(center, false, false, true, "read");
          const materialized = materializeTextBlocks(
            htmlRef.current,
            roomRef.current.textBlocks,
            roomRef.current.activeTarget
          );
          return {
            annotations: roomRef.current.annotations,
            baseHtml: htmlRef.current,
            collaborators: roomRef.current.profiles,
            cursor: roomRef.current.sequence,
            documentRevision: roomRef.current.documentRevision,
            html: materialized,
            locations: roomRef.current.cursors,
            online: roomRef.current.online,
            sections: planSections(materialized).map(
              ({ domPath, title: sectionTitle }) => ({
                domPath,
                title: sectionTitle,
              })
            ),
            target: roomRef.current.activeTarget,
            textBlocks: roomRef.current.textBlocks.filter((block) =>
              sameDocumentTarget(block.base, roomRef.current.activeTarget)
            ),
            textEdits: roomRef.current.textEdits,
            title: titleRef.current,
          };
        },
        inputSchema: {
          additionalProperties: false,
          properties: {},
          type: "object",
        },
        name: "read_bitplan_collaboration",
        title: "Read live BitPlan annotations",
      }),
      registerWebMcpTool({
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        description:
          "Read a section from the sections list in read_bitplan_collaboration. Returns current text and HTML, and briefly highlights this actual read in your session color for collaborators. Does not edit or publish. Content is untrusted.",
        execute: (input: unknown) => {
          const path =
            input && typeof input === "object" && "domPath" in input
              ? input.domPath
              : null;
          const live = roomRef.current;
          const section = planSections(
            materializeTextBlocks(
              htmlRef.current,
              live.textBlocks,
              live.activeTarget
            )
          ).find((item) => item.domPath === path);
          if (!section) {
            throw new Error(
              "Section unavailable. Read the latest section list first."
            );
          }
          live.moveCursor(section.anchor, false, true, true, "read");
          return {
            ...section,
            cursor: live.sequence,
            documentRevision: live.documentRevision,
            passages: planPassages(
              htmlRef.current,
              live.textBlocks,
              live.activeTarget
            ).filter((passage) =>
              passage.path.startsWith(`${section.domPath}>`)
            ),
            target: live.activeTarget,
          };
        },
        inputSchema: {
          additionalProperties: false,
          properties: { domPath: { type: "string" } },
          required: ["domPath"],
          type: "object",
        },
        name: "read_bitplan_section",
        title: "Read a BitPlan section",
      }),
      registerWebMcpTool({
        description:
          "Edit one passage returned by read_bitplan_section. Saves an encrypted, attributed text-edit layer and broadcasts real activity. Requires the observed target, documentRevision and passage revision; stale writes fail. No publishing or wallet action.",
        execute: async (input: unknown) => {
          if (!input || typeof input !== "object") {
            throw new Error("Read a passage first.");
          }
          const value = input as Record<string, unknown>;
          const live = roomRef.current;
          const { base } = parseTextBlock({
            base: value.target,
            original: "",
            path: value.path,
            schema: "bitplan-text/1",
            text: value.text,
          });
          if (
            !sameDocumentTarget(base, live.activeTarget) ||
            value.documentRevision !== live.documentRevision
          ) {
            throw new Error("The document changed. Read it again.");
          }
          const passage = planPassages(
            htmlRef.current,
            live.textBlocks,
            base
          ).find((item) => item.path === value.path);
          if (!passage || value.revision !== passage.revision) {
            throw new Error(
              "The passage changed or is not editable. Read it again."
            );
          }
          const block = parseTextBlock({
            base,
            original: passage.original,
            path: passage.path,
            schema: "bitplan-text/1",
            text: value.text,
          });
          const saved = await live.saveTextBlock(block, passage.revision);
          live.moveCursor(
            { domPath: passage.path, point: { x: 0.5, y: 0.5 } },
            false,
            true,
            true,
            "edit"
          );
          return {
            ...saved,
            path: passage.path,
            target: base,
            text: block.text,
          };
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            documentRevision: { minimum: 0, type: "integer" },
            path: { type: "string" },
            revision: { minimum: 0, type: "integer" },
            target: { type: "object" },
            text: { maxLength: 16_000, type: "string" },
          },
          required: ["path", "text", "target", "documentRevision", "revision"],
          type: "object",
        },
        name: "edit_bitplan_text",
        title: "Edit a BitPlan passage",
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
          const anchor = parseAnchor(input.anchor);
          const annotationId = await roomRef.current.saveAnnotation(
            parseAnnotationContent(input.content),
            anchor,
            undefined,
            "size" in input ? (input.size as Annotation["size"]) : undefined
          );
          roomRef.current.moveCursor(anchor, false, true, true, "annotate");
          return { annotationId };
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
            size: {
              additionalProperties: false,
              description:
                "Optional widget dimensions in CSS pixels; content should fit responsively.",
              properties: {
                height: { maximum: 1200, minimum: 96, type: "number" },
                width: { maximum: 1200, minimum: 160, type: "number" },
              },
              required: ["width", "height"],
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
          "Save shared HTML against the documentRevision and cursor returned by read_bitplan_collaboration. Its HTML includes live text edits; read its annotations before revising. Conflicts reject stale edits. No wallet action or inscription. Hosted plans only.",
        execute: (input: unknown) => {
          if (
            !input ||
            typeof input !== "object" ||
            !("html" in input) ||
            typeof input.html !== "string" ||
            !("expectedRevision" in input) ||
            typeof input.expectedRevision !== "number" ||
            !Number.isSafeInteger(input.expectedRevision) ||
            input.expectedRevision < 0 ||
            !("expectedSequence" in input) ||
            typeof input.expectedSequence !== "number" ||
            !Number.isSafeInteger(input.expectedSequence) ||
            input.expectedSequence < 0
          ) {
            throw new Error("Provide HTML and the observed document revision.");
          }
          return roomRef.current.saveDocument(
            input.html,
            input.expectedRevision,
            undefined,
            input.expectedSequence
          );
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            expectedRevision: { minimum: 0, type: "integer" },
            expectedSequence: {
              description: "The cursor from read_bitplan_collaboration.",
              minimum: 0,
              type: "integer",
            },
            html: { type: "string" },
          },
          required: ["html", "expectedRevision", "expectedSequence"],
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

  async function resolve(item: Annotation) {
    const { current } = roomRef;
    if (
      // biome-ignore lint/suspicious/noUnnecessaryConditions: asynchronous input can arrive during the pending save
      annotationActionBusy.current ||
      item.participantId !== current.connection?.participantId ||
      !sameDocumentTarget(item.target, current.activeTarget)
    ) {
      return;
    }
    annotationActionBusy.current = true;
    try {
      await current.saveAnnotation(item.content, item.anchor, {
        ...item,
        status: item.status === "open" ? "resolved" : "open",
      });
      if (item.status === "open") {
        removedAnnotations.current.push({
          ...item,
          revision: item.revision + 1,
          status: "resolved",
        });
        if (removedAnnotations.current.length > 50) {
          removedAnnotations.current.shift();
        }
        selectedAnnotation.current = null;
        toast.success("Annotation removed", {
          action: {
            label: "Undo",
            onClick: () => void undoAnnotationRemoval(),
          },
        });
      }
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Could not update annotation."
      );
    } finally {
      annotationActionBusy.current = false;
    }
  }
  async function undoAnnotationRemoval() {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: repeated key events can arrive while a restore is pending
    if (annotationActionBusy.current) {
      return;
    }
    const item = removedAnnotations.current.at(-1);
    const { current } = roomRef;
    if (
      !(item && sameDocumentTarget(item.target, current.activeTarget)) ||
      item.participantId !== current.connection?.participantId
    ) {
      return;
    }
    annotationActionBusy.current = true;
    try {
      await current.saveAnnotation(item.content, item.anchor, {
        ...item,
        status: "open",
      });
      removedAnnotations.current.pop();
      toast.success("Annotation restored");
    } catch {
      toast.error("This annotation changed. Review it before restoring.");
    } finally {
      annotationActionBusy.current = false;
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
    setEditor({
      html: materializeTextBlocks(
        currentHtml,
        room.textBlocks,
        room.activeTarget
      ),
      revision: room.documentRevision,
      sequence: room.sequence,
    });
    setEditError(null);
  }
  async function saveDocument() {
    if (!editor) {
      return;
    }
    setSavingDocument(true);
    try {
      await room.saveDocument(
        editor.html,
        editor.revision,
        undefined,
        editor.sequence
      );
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
    <div className="relative flex min-h-0 flex-1">
      {room.connection && showEdits && !panel ? <AnnotationOnboarding /> : null}
      {showEdits && inlineEditError ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2 text-sm"
          role="status"
        >
          <span>
            {inlineEditError ??
              "Click to select; click again to edit. Delete removes selected text blocks. Esc clears selection. V select · T comment · I image. Changes save live."}
          </span>
          <div className="flex gap-2">
            {inlineEditError ? (
              <>
                <Button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        [...textRecovery.current.values()]
                          .map((block) => block.text)
                          .join("\n\n")
                      );
                      toast.success("Unsaved text copied.");
                    } catch {
                      toast.error(
                        "Could not copy. Select the text on the page to copy it."
                      );
                    }
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Copy unsaved text
                </Button>
                <Button
                  onClick={() => {
                    textRecovery.current.clear();
                    textPort.current?.postMessage({ type: "discard" });
                    setInlineEditError(null);
                  }}
                  size="sm"
                  variant="outline"
                >
                  Load latest text
                </Button>
              </>
            ) : null}
            <Button
              onClick={() => setInlineEditing(false)}
              size="sm"
              variant="ghost"
            >
              Done
            </Button>
          </div>
        </div>
      ) : null}
      <ContextMenu.Root
        modal={false}
        onOpenChange={setToolsOpen}
        open={toolsOpen}
      >
        <ContextMenu.Trigger
          asChild
          disabled={!room.connection || browserMenu || !showEdits}
        >
          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            data-bitplan-connected={room.connection ? room.online : undefined}
            data-bitplan-sequence={room.connection ? room.sequence : undefined}
            onAuxClickCapture={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onContextMenuCapture={(event) => {
              if (browserMenu || !room.connection || !showEdits) {
                event.stopPropagation();
                return;
              }
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
            onPointerCancel={() => {
              viewportPan.current = null;
            }}
            onPointerDownCapture={(event) => {
              if (event.button !== 1) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              viewportPan.current = { x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMoveCapture={(event) => {
              const pan = viewportPan.current;
              // biome-ignore lint/suspicious/noUnnecessaryConditions: independent pointer events can arrive before a pan starts
              if (!pan) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              geometryPort.current?.postMessage({
                payload: {
                  kind: "pan",
                  x: event.clientX - pan.x,
                  y: event.clientY - pan.y,
                },
                type: "navigate",
              });
              viewportPan.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerUpCapture={() => {
              viewportPan.current = null;
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
                style={{ colorScheme: resolvedTheme }}
                title={title}
              />
            ) : null}
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden"
              style={{ visibility: showEdits ? undefined : "hidden" }}
            >
              {drawing ? (
                <AnnotationDrawLayer
                  color={drawingColor}
                  key={documentHtml}
                  onCancel={() => setDrawing(null)}
                  onSave={async (asset) => {
                    const base = room.activeTarget;
                    const at = await new Promise<AnnotationAnchor>(
                      (complete, reject) => {
                        const timer = setTimeout(() => {
                          resolveDrawingAnchor.current = null;
                          reject(
                            new Error(
                              "The document did not respond. Retry your drawing."
                            )
                          );
                        }, 3000);
                        resolveDrawingAnchor.current = (value) => {
                          clearTimeout(timer);
                          resolveDrawingAnchor.current = null;
                          complete(value);
                        };
                        geometryPort.current?.postMessage({
                          payload: asset.point,
                          type: "resolve-anchor",
                        });
                      }
                    );
                    if (
                      !sameDocumentTarget(base, roomRef.current.activeTarget)
                    ) {
                      throw new Error(
                        "The plan changed. Return to the original version before saving this drawing."
                      );
                    }
                    await roomRef.current.saveAnnotation(
                      {
                        alt: `${drawing} drawing`,
                        dataUrl: asset.dataUrl,
                        type: "image",
                      },
                      at,
                      undefined,
                      {
                        height: Math.round(asset.size.height / viewScale),
                        width: Math.round(asset.size.width / viewScale),
                      }
                    );
                    roomRef.current.moveCursor(at, true);
                  }}
                  tool={drawing}
                />
              ) : null}
              {[
                {
                  color: sessionColor(room.connection?.sessionId ?? ""),
                  id: "highlight",
                  reading: false,
                },
                ...room.cursors
                  .filter(
                    (cursor) =>
                      cursor.selecting &&
                      (cursor.sessionId !== room.connection?.sessionId ||
                        !!cursor.activity) &&
                      (!cursor.activity ||
                        activityTime - cursor.updatedAt < 6000) &&
                      sameDocumentTarget(cursor.target, room.activeTarget) &&
                      cursorIsActive(
                        cursor.online,
                        cursor.updatedAt,
                        activityTime
                      )
                  )
                  .map((cursor) => ({
                    color: sessionColor(cursor.sessionId),
                    id: `cursor-${cursor.sessionId}`,
                    reading: !!cursor.activity,
                  })),
              ].map((item) => {
                const bounds = positions[item.id]?.bounds;
                return bounds ? (
                  <div
                    aria-hidden="true"
                    className="absolute overflow-hidden border-2"
                    data-agent-reading={item.reading || undefined}
                    data-element-highlight={item.id}
                    key={item.id}
                    style={{
                      backgroundColor: `color-mix(in srgb, ${item.color} 10%, transparent)`,
                      borderColor: item.color,
                      color: item.color,
                      height: bounds.height,
                      left: bounds.x,
                      top: bounds.y,
                      width: bounds.width,
                    }}
                  >
                    {item.reading ? (
                      <span className="bitplan-read-scan absolute inset-0" />
                    ) : null}
                  </div>
                ) : null;
              })}
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
                    onSelect={() => {
                      selectedAnnotation.current = item.id;
                      setHighlight(item.anchor);
                      textPort.current?.postMessage({
                        type: "clear-selection",
                      });
                    }}
                    save={(changes) =>
                      room.saveAnnotation(item.content, item.anchor, {
                        ...item,
                        ...changes,
                      })
                    }
                    style={{
                      left: point.x,
                      top: point.y,
                    }}
                    viewScale={viewScale}
                  >
                    <button
                      className={
                        item.content.type === "image" ||
                        item.content.type === "html"
                          ? "absolute -top-6 left-0 rounded bg-background/90 px-1 text-muted-foreground text-xs opacity-0 group-focus-within/annotation:opacity-100 group-hover/annotation:opacity-100"
                          : "mb-1 block text-muted-foreground text-xs"
                      }
                      onClick={() => setPanel(true)}
                      type="button"
                    >
                      {room.profiles[item.participantId]?.name ??
                        "Collaborator"}{" "}
                      · {index + 1}
                    </button>
                    {item.content.type === "text" ? (
                      <AnnotationThread
                        currentParticipantId={room.connection?.participantId}
                        disabled={!room.online}
                        item={item}
                        onReply={(replyText) =>
                          room.saveAnnotation(
                            { text: replyText, type: "text" },
                            item.anchor,
                            undefined,
                            undefined,
                            item.id
                          )
                        }
                        profiles={room.profiles}
                        replies={annotationReplies(item, room.annotations)}
                      />
                    ) : (
                      <AnnotationBody content={item.content} />
                    )}
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
                        {cursorStatus(cursor, activityTime)}
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
                  title="Collaborators on earlier versions"
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
                        title={`${profile.name} · ${cursorTimeAgo(cursor.updatedAt, activityTime)}`}
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
                      {cursor.kind === "agent" ? " · Agent" : ""} ·{" "}
                      {cursorTimeAgo(cursor.updatedAt, activityTime)} · earlier
                      version
                    </p>
                  ))}
                </div>
              </details>
            ) : null}
            {inline?.kind === "image" ? (
              <AnnotationImagePicker
                initiallyOpen
                onClose={() => setInline(null)}
                onLoad={async (dataUrl, alt) => {
                  if (
                    !sameDocumentTarget(
                      inline.target,
                      roomRef.current.activeTarget
                    )
                  ) {
                    throw new Error(
                      "The document changed. Close the picker and choose the image position again."
                    );
                  }
                  await room.saveAnnotation(
                    { alt: alt ?? "Image annotation", dataUrl, type: "image" },
                    inline.anchor
                  );
                  setInline(null);
                }}
              />
            ) : null}
            {inline && !inline.kind && positions.composer ? (
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
                <textarea
                  aria-label="Annotation text"
                  autoFocus
                  className="min-h-20 w-full resize-y rounded border bg-background p-2 text-sm"
                  maxLength={32_000}
                  onChange={(event) =>
                    setInline((value) =>
                      value ? { ...value, text: event.target.value } : null
                    )
                  }
                  onKeyDown={handleInlineKeyDown}
                  placeholder="Write an annotation…"
                  readOnly={busy}
                  ref={inlineInput}
                  value={inline.text}
                />
                <p className="text-muted-foreground text-xs" role="status">
                  {busy
                    ? "Saving…"
                    : "Enter to save · Shift+Enter for a new line · Esc to cancel"}
                </p>
              </form>
            ) : null}
            {picking ? (
              <Button
                className="absolute bottom-16 left-4"
                onClick={stopPicking}
                variant="secondary"
              >
                Choose an element · Esc to cancel
              </Button>
            ) : null}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            aria-label="Annotation tools"
            className="z-50 flex gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            data-plan-tools=""
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              inlineInput.current?.focus();
            }}
          >
            <ContextMenu.Item
              aria-label="Settings"
              className={menuItem}
              onSelect={() => onSettingsOpenChange(true)}
              title="Settings"
            >
              <Settings />
            </ContextMenu.Item>
            <ContextMenu.Item
              aria-label="Add text annotation"
              className={menuItem}
              disabled={busy || !!inline}
              onSelect={() => {
                startPicking();
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
                startPicking("image");
              }}
              title="Add image or SVG"
            >
              <ImagePlus />
            </ContextMenu.Item>
            <ContextMenu.Item
              aria-label="Draw with pen"
              className={menuItem}
              onSelect={() => {
                setPanel(false);
                setDrawing("pen");
              }}
              title="Pen"
            >
              <PenTool />
            </ContextMenu.Item>
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger
                aria-label="Shapes"
                className={menuItem}
                title="Shapes"
              >
                <Shapes />
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="z-50 min-w-36 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                  {(
                    ["rectangle", "ellipse", "line", "arrow", "cloud"] as const
                  ).map((shape) => (
                    <ContextMenu.Item
                      className={menuItem}
                      key={shape}
                      onSelect={() => {
                        setPanel(false);
                        setDrawing(shape);
                      }}
                    >
                      {shape === "cloud"
                        ? "Thought cloud"
                        : shape[0].toUpperCase() + shape.slice(1)}
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
            <label className="flex items-center px-2" title="Drawing color">
              <span className="sr-only">Drawing color</span>
              <input
                aria-label="Drawing color"
                className="size-7 cursor-pointer border-0 bg-transparent"
                onChange={(event) => setDrawingColor(event.target.value)}
                type="color"
                value={drawingColor}
              />
            </label>
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
      <Dialog onOpenChange={setPanel} open={panel || settingsOpen}>
        <DialogContent
          aria-label="Plan menu"
          className="h-[min(850px,90dvh)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-[18px] bg-background p-0 shadow-2xl sm:w-[calc(100vw-4rem)] sm:max-w-[1100px] md:grid-cols-[minmax(230px,1fr)_minmax(0,1.6fr)] md:grid-rows-1"
          fullScreenOnMobile={false}
          id="bitplan-annotations"
        >
          <div className="flex flex-col border-b p-5 md:border-r md:border-b-0 md:p-12">
            <DialogTitle className="font-normal font-serif text-4xl tracking-tight md:text-6xl">
              Your plan
            </DialogTitle>
            <DialogDescription className="sr-only">
              Review contributions, choose access, and prepare the next version.
            </DialogDescription>
            <nav
              aria-label="Plan sections"
              className="mt-4 flex flex-wrap gap-x-4 gap-y-2 md:mt-10 md:flex-col md:gap-4"
            >
              {[
                "Review changes",
                "Access",
                "Export PDF",
                "Interaction",
                "Appearance",
                "Sound",
                "Document details",
              ].map((section) => (
                <button
                  aria-current={publishSection === section ? "page" : undefined}
                  className="relative whitespace-nowrap rounded-sm py-1 pl-3 text-left font-serif text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 aria-[current=page]:text-foreground md:pl-4 md:text-2xl"
                  disabled={
                    !room.connection &&
                    ["Review changes", "Access", "Export PDF"].includes(section)
                  }
                  key={section}
                  onClick={() => setPublishSection(section)}
                  type="button"
                >
                  {publishSection === section ? (
                    <span className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-primary" />
                  ) : null}
                  {section}
                </button>
              ))}
            </nav>
            <p className="mt-auto hidden border-t pt-5 font-serif text-muted-foreground md:block">
              {title} · v{target.version}
            </p>
          </div>
          <div
            className="fade-in slide-in-from-right-2 flex min-h-0 animate-in flex-col overflow-hidden px-6 pt-6 duration-200 motion-reduce:animate-none md:px-12 md:pt-12"
            key={publishSection}
          >
            <h2 className="font-serif text-3xl md:text-4xl">
              {publishSection}
            </h2>
            <p className="mt-2 mb-6 text-muted-foreground text-sm">
              {preferenceSection &&
                "Personal preferences & document information"}
              {!preferenceSection &&
                (draftingRevision
                  ? `Next version · v${target.version + 1}`
                  : "Your annotation layer")}
            </p>
            {preferenceSection ? (
              <PlanSettings
                browserMenu={browserMenu}
                details={settingsDetails}
                interaction={
                  <>
                    <fieldset className="space-y-2 pb-3">
                      <legend className="mb-2 font-medium text-sm">
                        Your view
                      </legend>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          checked={showEdits}
                          onChange={(event) => {
                            if (
                              textRecovery.current.size ||
                              inline ||
                              editor ||
                              drawing
                            ) {
                              toast.info(
                                "Finish your current edit before comparing."
                              );
                              return;
                            }
                            stopPicking();
                            setShowEdits(event.target.checked);
                          }}
                          type="checkbox"
                        />
                        Show live changes
                      </label>
                      <p className="text-muted-foreground text-xs">
                        {showEdits
                          ? "Only changes your view. Nothing is removed."
                          : "Original version · read-only. Live changes are still saved."}
                      </p>
                    </fieldset>
                    <Button
                      disabled={!showEdits}
                      onClick={() => {
                        setPanel(false);
                        startPicking();
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Annotate an element
                    </Button>
                    {isHostedId(target.origin) ? (
                      <>
                        <Button
                          disabled={!showEdits}
                          onClick={() => {
                            setInlineEditing((value) => !value);
                            setPanel(false);
                            setPanel(false);
                          }}
                          size="sm"
                          variant="outline"
                        >
                          {inlineEditing
                            ? "Finish editing text"
                            : "Edit text in place"}
                        </Button>
                        <Button
                          disabled={!showEdits}
                          onClick={() => {
                            setPanel(false);
                            editDocument();
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          Edit HTML
                        </Button>
                      </>
                    ) : null}
                  </>
                }
                onBrowserMenuChange={changeBrowserMenu}
                onResetView={() =>
                  geometryPort.current?.postMessage({
                    payload: { kind: "reset" },
                    type: "navigate",
                  })
                }
                section={publishSection}
              />
            ) : null}
            {preferenceSection || publishSection === "Review changes" ? null : (
              <div className="plan-scroll scroll-fade min-h-0 flex-1 overflow-y-auto [--scroll-fade-size:16px]">
                <PlanAccessPanel
                  origin={target.origin}
                  publisher={isPublisher}
                  view={publishSection === "Access" ? "access" : "pdf"}
                />
              </div>
            )}
            <div
              className="plan-scroll scroll-fade min-h-0 flex-1 space-y-1 overflow-y-auto [--scroll-fade-size:16px]"
              hidden={publishSection !== "Review changes"}
            >
              <DocumentEditSummary
                blocks={reviewEdits.filter(
                  (block) =>
                    sameDocumentTarget(block.base, room.activeTarget) &&
                    (isPublisher ||
                      block.participantId === room.connection?.participantId)
                )}
                currentParticipantId={room.connection?.participantId}
                excluded={excluded}
                htmlRevision={
                  room.documentDraft?.html === undefined
                    ? undefined
                    : room.documentDraft.revision
                }
                onConsiderAll={
                  isPublisher
                    ? (include) =>
                        setExcluded((previous) => {
                          const next = new Set(previous);
                          for (const block of reviewEdits.filter((entry) =>
                            sameDocumentTarget(entry.base, room.activeTarget)
                          )) {
                            const key = JSON.stringify([
                              block.participantId,
                              block.path,
                            ]);
                            if (include) {
                              next.delete(key);
                            } else {
                              next.add(key);
                            }
                          }
                          return next;
                        })
                    : undefined
                }
                onRevert={async (block) => {
                  const latest = room.textBlocks.find(
                    (item) =>
                      item.path === block.path &&
                      sameDocumentTarget(item.base, block.base)
                  );
                  if (
                    !latest ||
                    latest.revision !== block.revision ||
                    latest.participantId !== room.connection?.participantId
                  ) {
                    toast.error(
                      "This passage changed. Review the latest edit first."
                    );
                    return;
                  }
                  try {
                    await room.saveTextBlock(
                      { ...block, deleted: false, text: block.original },
                      block.revision
                    );
                    toast.success(
                      "Original text restored. History is retained."
                    );
                  } catch {
                    toast.error(
                      "Could not restore text. Refresh and review the latest edit."
                    );
                  }
                }}
                onToggle={
                  isPublisher
                    ? (id) =>
                        setExcluded((previous) => {
                          const next = new Set(previous);
                          if (!next.delete(id)) {
                            next.add(id);
                          }
                          return next;
                        })
                    : undefined
                }
                profiles={room.profiles}
              />
              {room.annotations.some(
                (item) =>
                  sameDocumentTarget(item.target, room.activeTarget) &&
                  item.status === "open" &&
                  (isPublisher ||
                    item.participantId === room.connection?.participantId)
              ) ||
              reviewEdits.some(
                (item) =>
                  sameDocumentTarget(item.base, room.activeTarget) &&
                  (isPublisher ||
                    item.participantId === room.connection?.participantId)
              ) ? null : (
                <div className="py-10 text-center">
                  <p className="font-serif text-xl">
                    {isPublisher
                      ? "Room for the next idea."
                      : "Make your first mark."}
                  </p>
                  <p className="mx-auto mt-2 max-w-60 text-muted-foreground text-sm">
                    Add a note, edit a passage, or drop an image onto the plan.
                    Your changes appear here.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => startPicking()}
                    size="sm"
                    variant="outline"
                  >
                    Add a note
                  </Button>
                </div>
              )}
              {room.annotations
                .filter(
                  (item) =>
                    sameDocumentTarget(item.target, room.activeTarget) &&
                    item.status === "open" &&
                    (isPublisher ||
                      item.participantId === room.connection?.participantId)
                )
                .sort(contributionOrder)
                .map((item) => (
                  <article
                    className="flex items-start gap-3 border-border/50 border-b py-5 text-sm"
                    data-annotation-id={item.id}
                    key={item.id}
                  >
                    {isPublisher ? (
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          checked={!excluded.has(item.id)}
                          onChange={() =>
                            setExcluded((previous) => {
                              const next = new Set(previous);
                              if (!next.delete(item.id)) {
                                next.add(item.id);
                              }
                              return next;
                            })
                          }
                          type="checkbox"
                        />
                        <span className="sr-only">Consider in revision</span>
                      </label>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <ReviewAuthor
                          detail={`${item.replyTo ? "Reply" : item.content.type} · edit ${item.revision}`}
                          profile={room.profiles[item.participantId]}
                        />
                        {item.participantId ===
                        room.connection?.participantId ? (
                          <Button
                            aria-label="Remove my annotation"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => void resolve(item)}
                            size="icon-sm"
                            title="Remove contribution; history is retained"
                            variant="ghost"
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-3 rounded-xl bg-muted/45 px-4 py-3 leading-relaxed">
                        <AnnotationAttachmentStatus
                          item={item}
                          position={positions[item.id]}
                          target={room.activeTarget}
                        />
                        {item.content.type === "text" ? (
                          <AnnotationThread
                            currentParticipantId={
                              room.connection?.participantId
                            }
                            disabled={
                              !(
                                room.online &&
                                sameDocumentTarget(
                                  item.target,
                                  room.activeTarget
                                )
                              )
                            }
                            item={item}
                            onReply={(replyText) =>
                              room.saveAnnotation(
                                { text: replyText, type: "text" },
                                item.anchor,
                                undefined,
                                undefined,
                                item.replyTo ?? item.id
                              )
                            }
                            profiles={room.profiles}
                            replies={[]}
                          />
                        ) : (
                          <AnnotationBody content={item.content} />
                        )}
                      </div>
                    </div>
                  </article>
                ))}
            </div>
            <div
              className="shrink-0 space-y-3 border-t bg-background py-5"
              hidden={preferenceSection || !room.connection}
            >
              <div
                className="space-y-4"
                hidden={publishSection !== "Review changes"}
              >
                <button
                  className="flex w-full items-center justify-between py-2 text-left text-sm"
                  onClick={() => setPublishSection("Access")}
                  type="button"
                >
                  <span>
                    {sharing?.value.mode === "link" ||
                    (sharing?.value.mode === "preserve" &&
                      sharing.currentAccess.link)
                      ? "Anyone with the link"
                      : `Private · ${sharing?.value.teams?.map((t) => t.name).join(", ") || "Selected people"} · ${sharing?.value.mode === "preserve" ? sharing.currentAccess.recipients.length : (sharing?.value.recipients.length ?? 0)} people`}
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
                {onSaveHosted &&
                !publishOnChain &&
                sharing?.value.mode === "preserve" ? (
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      disabled={savingHosted || !room.online}
                      onClick={async () => {
                        if (
                          textRecovery.current.size ||
                          inline ||
                          editor ||
                          drawing
                        ) {
                          toast.info(
                            "Finish your current edit before saving a version."
                          );
                          return;
                        }
                        const { sequence } = room;
                        const snapshot = materializeTextBlocks(
                          currentHtml,
                          room.textBlocks,
                          room.activeTarget
                        );
                        setSavingHosted(true);
                        try {
                          await onSaveHosted(snapshot, () => {
                            if (
                              !roomRef.current.online ||
                              roomRef.current.sequence !== sequence
                            ) {
                              throw new Error(
                                "The live plan changed. Review it before saving."
                              );
                            }
                          });
                          toast.success("New hosted version saved");
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not save this version"
                          );
                        } finally {
                          setSavingHosted(false);
                        }
                      }}
                    >
                      {savingHosted ? "Saving…" : "Save current document"}
                    </Button>
                    <p className="text-muted-foreground text-xs">
                      Saves all live document edits with current access. Notes
                      stay on their original version.
                    </p>
                  </div>
                ) : null}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm" htmlFor="revision-on-chain">
                      Publish on chain
                    </label>
                    <Switch
                      checked={publishOnChain}
                      id="revision-on-chain"
                      onCheckedChange={setPublishOnChain}
                    />
                  </div>
                  <textarea
                    aria-label="Instructions for the next version"
                    className="min-h-20 w-full resize-y rounded-lg border bg-background p-3 text-sm"
                    maxLength={4000}
                    onChange={(event) => setRevisionNotes(event.target.value)}
                    placeholder="Direction for your agent…"
                    value={revisionNotes}
                  />
                </div>
              </div>
              <Button
                className="h-11 w-full text-base"
                disabled={
                  isPublisher &&
                  sharing?.value.mode === "private" &&
                  !sharing.value.recipients.length
                }
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      draftingRevision
                        ? revisionSelectionPrompt(target.origin, {
                            annotations: room.annotations
                              .filter(
                                (item) =>
                                  !item.replyTo &&
                                  item.status === "open" &&
                                  sameDocumentTarget(
                                    item.target,
                                    room.activeTarget
                                  )
                              )
                              .map((item) => ({
                                id: item.id,
                                include: !excluded.has(item.id),
                                revision: item.revision,
                              })),
                            cursor: room.sequence,
                            documentRevision: room.documentRevision,
                            notes: revisionNotes,
                            publishOnChain,
                            sharing: sharing?.value,
                            target: room.activeTarget,
                            textEdits: reviewEdits
                              .filter((item) =>
                                sameDocumentTarget(item.base, room.activeTarget)
                              )
                              .map((item) => ({
                                include: !excluded.has(
                                  JSON.stringify([
                                    item.participantId,
                                    item.path,
                                  ])
                                ),
                                participantId: item.participantId,
                                path: item.path,
                                revision: item.revision,
                              })),
                          })
                        : annotationPublicationPrompt(target.origin, {
                            cursor: room.sequence,
                            notes: revisionNotes,
                            participantId: room.connection?.participantId ?? "",
                            publishOnChain,
                            sharingMode: "preserve",
                            target: room.activeTarget,
                          })
                    );
                    toast.success("Prompt copied — send it to your agent");
                  } catch {
                    toast.error("Could not copy the prompt");
                  }
                }}
              >
                <Copy /> Copy agent prompt
              </Button>
              <p className="text-muted-foreground text-xs">
                {publishOnChain && "You approve before signing."}
                {!publishOnChain &&
                  draftingRevision &&
                  "Your agent saves the next version."}
                {!(publishOnChain || draftingRevision) &&
                  "Your agent prepares your annotation layer."}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={(open) => {
          if (!(open || savingDocument)) {
            setEditor(null);
          }
        }}
        open={!!editor}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle>Edit page</DialogTitle>
          <DialogDescription>
            Save sends this HTML to every collaborator. It does not publish a
            transaction. Newer edits reject a stale save. Reload shared version
            only discards unsaved changes in this text box; it does not undo
            text edits already saved live.
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
            {room.documentRevision}
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
              Reload shared version
            </Button>
            <Button
              disabled={savingDocument}
              onClick={() => void saveDocument()}
            >
              {savingDocument ? "Saving…" : "Save page"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AnnotationBody({ content }: { content: AnnotationContent }) {
  const { resolvedTheme } = useTheme();
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
        className="block h-full min-h-24 w-full border-0 bg-transparent"
        sandbox=""
        srcDoc={withRenderPolicy(
          content.html,
          `<style>:root{color-scheme:${resolvedTheme === "dark" ? "dark" : "light"}}html,body{margin:0;background:transparent}body{overflow-wrap:anywhere}</style>`
        )}
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
