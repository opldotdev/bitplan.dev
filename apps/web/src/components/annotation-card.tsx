"use client";

import { Grip } from "lucide-react";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
}: {
  item: Annotation;
  label: string;
  style: CSSProperties;
  canResize: boolean;
  save: (size: NonNullable<Annotation["size"]>) => Promise<unknown>;
  children: ReactNode;
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
  const size = draft ?? item.size;
  const clamp = (width: number, height: number) => ({
    height: Math.max(96, Math.min(1200, Math.round(height))),
    width: Math.max(160, Math.min(1200, Math.round(width))),
  });
  async function persist(next: NonNullable<Annotation["size"]>) {
    setSaving(true);
    try {
      await save(next);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not resize annotation."
      );
    } finally {
      setSaving(false);
      setDraft(undefined);
    }
  }
  return (
    <article
      aria-busy={saving}
      aria-label={label}
      className={`pointer-events-auto absolute flex max-w-[90%] flex-col rounded-md border p-2 pb-6 text-sm ${item.content.type === "image" ? "border-transparent bg-transparent focus-within:border-border hover:border-border" : "bg-background shadow-sm"}`}
      data-annotation-anchor={item.id}
      ref={card}
      style={{ ...style, height: size?.height, width: size?.width ?? 224 }}
    >
      <div
        className="min-h-0 flex-1 overflow-auto"
        style={{ maxHeight: size ? undefined : 240 }}
      >
        {children}
      </div>
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
