"use client";

import { Grip, Move } from "lucide-react";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { moveAnnotationPlacement } from "@/lib/annotation-position";
import type { Annotation } from "@/lib/annotations";

function keyDelta(key: string, positive: string, negative: string): number {
  if (key === positive) {
    return 16;
  }
  if (key === negative) {
    return -16;
  }
  return 0;
}

export function AnnotationCard({
  item,
  label,
  style,
  canResize,
  save,
  children,
  onSelect,
}: {
  item: Annotation;
  label: string;
  style: CSSProperties;
  canResize: boolean;
  save: (
    changes: Partial<Pick<Annotation, "size" | "placement">>
  ) => Promise<unknown>;
  children: ReactNode;
  onSelect?: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [draft, setDraft] = useState<Annotation["size"]>();
  const [saving, setSaving] = useState(false);
  const moving = useRef<{
    x: number;
    y: number;
    dx: number;
    dy: number;
  } | null>(null);
  const [placement, setPlacement] = useState<Annotation["placement"]>();
  const position = placement ?? item.placement;
  const size = draft ?? item.size;
  const clamp = (width: number, height: number) => ({
    height: Math.max(96, Math.min(1200, Math.round(height))),
    width: Math.max(160, Math.min(1200, Math.round(width))),
  });
  async function persist(next: NonNullable<Annotation["size"]>) {
    setSaving(true);
    try {
      await save({ size: next });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not resize annotation."
      );
    } finally {
      setSaving(false);
      setDraft(undefined);
    }
  }
  async function move(next: Annotation["placement"]) {
    setSaving(true);
    try {
      await save({ placement: next });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not move annotation."
      );
    } finally {
      setSaving(false);
      setPlacement(undefined);
    }
  }
  function moved(x: number, y: number) {
    const start = moving.current;
    return moveAnnotationPlacement(start ?? position, {
      x: x - (start?.x ?? x),
      y: y - (start?.y ?? y),
    });
  }
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: passive anchor highlighting augments child controls; it never replaces their keyboard behavior
    <article
      aria-busy={saving}
      aria-label={label}
      className={`group/annotation pointer-events-auto absolute flex max-w-[90%] flex-col rounded-md text-sm ${item.content.type === "image" ? "bg-transparent outline-border focus-within:outline hover:outline" : "border bg-background p-2 pb-6 shadow-sm"}`}
      data-annotation-anchor={item.id}
      onFocus={onSelect}
      onPointerCancel={() => {
        moving.current = null;
        setPlacement(undefined);
      }}
      onPointerDown={(event) => {
        onSelect?.();
        const target = event.target as HTMLElement;
        const handle = target.closest("[data-move-annotation]");
        const image =
          item.content.type === "image" &&
          !target.closest("button,a,input,textarea");
        if (!canResize || saving || event.button !== 0 || !(handle || image)) {
          return;
        }
        event.preventDefault();
        moving.current = { x: event.clientX, y: event.clientY, ...position };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        // biome-ignore lint/suspicious/noUnnecessaryConditions: pointer refs change across independent native events
        if (moving.current) {
          setPlacement(moved(event.clientX, event.clientY));
        }
      }}
      onPointerUp={(event) => {
        // biome-ignore lint/suspicious/noUnnecessaryConditions: pointerup can arrive without a drag
        if (!moving.current) {
          return;
        }
        const next = moved(event.clientX, event.clientY);
        moving.current = null;
        setPlacement(next);
        void move(next);
      }}
      ref={card}
      style={{
        ...style,
        height: size?.height,
        touchAction:
          item.content.type === "image" && canResize ? "none" : undefined,
        translate: `${position.dx}px ${position.dy}px`,
        width: size?.width ?? 224,
      }}
    >
      <div
        className="min-h-0 flex-1 overflow-auto"
        style={{ maxHeight: size ? undefined : 240 }}
      >
        {children}
      </div>
      {canResize ? (
        <Button
          aria-label={`Move ${label.toLowerCase()}`}
          className="absolute bottom-0 left-0 size-6 cursor-grab touch-none active:cursor-grabbing"
          data-move-annotation
          disabled={saving}
          onKeyDown={(event) => {
            if (
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                event.key
              )
            ) {
              return;
            }
            event.preventDefault();
            const next = moveAnnotationPlacement(position, {
              x: keyDelta(event.key, "ArrowRight", "ArrowLeft"),
              y: keyDelta(event.key, "ArrowDown", "ArrowUp"),
            });
            setPlacement(next);
            void move(next);
          }}
          size="icon-sm"
          title="Drag to move · arrow keys adjust position"
          variant="ghost"
        >
          <Move className="size-3" />
        </Button>
      ) : null}
      {canResize ? (
        <Button
          aria-label={`Resize ${label.toLowerCase()}`}
          className="absolute right-0 bottom-0 size-6 cursor-se-resize touch-none"
          disabled={saving}
          onKeyDown={(event) => {
            if (
              !(
                ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  event.key
                ) && card.current
              )
            ) {
              return;
            }
            event.preventDefault();
            const rect = card.current.getBoundingClientRect();
            const next = clamp(
              rect.width + keyDelta(event.key, "ArrowRight", "ArrowLeft"),
              rect.height + keyDelta(event.key, "ArrowDown", "ArrowUp")
            );
            setDraft(next);
            void persist(next);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDraft(undefined);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || !card.current) {
              return;
            }
            event.preventDefault();
            const rect = card.current.getBoundingClientRect();
            drag.current = {
              height: rect.height,
              width: rect.width,
              x: event.clientX,
              y: event.clientY,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            // biome-ignore lint/suspicious/noUnnecessaryConditions: the pointer ref changes across independent DOM events
            if (start) {
              setDraft(
                clamp(
                  start.width + event.clientX - start.x,
                  start.height + event.clientY - start.y
                )
              );
            }
          }}
          onPointerUp={(event) => {
            const start = drag.current;
            // biome-ignore lint/suspicious/noUnnecessaryConditions: pointerup may arrive without a matching active drag
            if (!start) {
              return;
            }
            drag.current = null;
            const next = clamp(
              start.width + event.clientX - start.x,
              start.height + event.clientY - start.y
            );
            setDraft(next);
            void persist(next);
          }}
          size="icon-sm"
          title="Drag to resize · arrow keys adjust size"
          variant="ghost"
        >
          <Grip className="size-3" />
        </Button>
      ) : null}
    </article>
  );
}
