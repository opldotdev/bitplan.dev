"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  insideLasso,
  paintMark,
  type SketchMark,
  type SketchPoint,
} from "@/lib/sketch";

export function AnnotationSketch({
  onUse,
}: {
  onUse: (dataUrl: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [marks, setMarks] = useState<SketchMark[]>([]);
  const [tool, setTool] = useState<SketchMark["tool"] | "lasso" | "move">(
    "pen"
  );
  const [color, setColor] = useState("#b65c38");
  const [selection, setSelection] = useState<number[]>([]);
  const [draft, setDraft] = useState<SketchPoint[]>([]);
  const gesture = useRef<{
    points: SketchPoint[];
    original: SketchMark[];
  } | null>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, 600, 400);
    marks.forEach((mark, i) => {
      ctx.globalAlpha = selection.length && !selection.includes(i) ? 0.4 : 1;
      paintMark(ctx, mark);
    });
    ctx.globalAlpha = 1;
    if (tool === "lasso") {
      ctx.setLineDash([5, 5]);
    }
    if (tool !== "move") {
      paintMark(ctx, {
        color,
        points: draft,
        tool: tool === "lasso" ? "pen" : tool,
      });
    }
    ctx.setLineDash([]);
  }, [marks, draft, selection, tool, color]);
  return (
    <div className="space-y-3">
      <fieldset className="border-0 p-0">
        <legend className="sr-only">Drawing tools</legend>
        <div className="flex flex-wrap gap-1">
          {(["pen", "rectangle", "ellipse", "lasso", "move"] as const).map(
            (value) => (
              <Button
                aria-pressed={tool === value}
                className="min-h-11"
                key={value}
                onClick={() => {
                  setTool(value);
                  if (value !== "move") {
                    setSelection([]);
                  }
                }}
                type="button"
                variant={tool === value ? "secondary" : "ghost"}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </Button>
            )
          )}
          <label className="flex min-h-11 items-center gap-2 px-2 text-xs">
            Color
            <input
              aria-label="Drawing color"
              className="size-9 cursor-pointer"
              onChange={(event) => setColor(event.target.value)}
              type="color"
              value={color}
            />
          </label>
        </div>
      </fieldset>
      <canvas
        aria-label="Draw your annotation with a pointer or touch"
        className="aspect-[3/2] w-full touch-none rounded-xl border bg-white"
        height={400}
        onPointerCancel={() => {
          // biome-ignore lint/suspicious/noUnnecessaryConditions: the gesture ref changes across independent pointer events
          if (gesture.current) {
            setMarks(gesture.current.original);
          }
          gesture.current = null;
          setDraft([]);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          const point = {
            x: ((event.clientX - bounds.left) * 600) / bounds.width,
            y: ((event.clientY - bounds.top) * 400) / bounds.height,
          };
          gesture.current = { original: marks, points: [point] };
          setDraft([point]);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const active = gesture.current;
          // biome-ignore lint/suspicious/noUnnecessaryConditions: pointermove may arrive without an active gesture
          if (!active) {
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          const point = {
            x: Math.max(
              0,
              Math.min(
                600,
                ((event.clientX - bounds.left) * 600) / bounds.width
              )
            ),
            y: Math.max(
              0,
              Math.min(
                400,
                ((event.clientY - bounds.top) * 400) / bounds.height
              )
            ),
          };
          if (tool === "move") {
            const dx = point.x - active.points[0].x,
              dy = point.y - active.points[0].y;
            setMarks(
              active.original.map((mark, i) =>
                selection.includes(i)
                  ? {
                      ...mark,
                      points: mark.points.map((p) => ({
                        x: p.x + dx,
                        y: p.y + dy,
                      })),
                    }
                  : mark
              )
            );
          } else if (active.points.length < 5000) {
            active.points.push(point);
            setDraft([...active.points]);
          }
        }}
        onPointerUp={() => {
          const active = gesture.current;
          // biome-ignore lint/suspicious/noUnnecessaryConditions: pointerup may arrive after cancellation
          if (!active) {
            return;
          }
          gesture.current = null;
          if (tool === "lasso") {
            setSelection(
              marks.flatMap((mark, i) =>
                mark.points.every((point) => insideLasso(point, active.points))
                  ? [i]
                  : []
              )
            );
            setTool("move");
          } else if (tool !== "move") {
            setMarks([...marks, { color, points: active.points, tool }]);
          }
          setDraft([]);
        }}
        ref={canvas}
        width={600}
      />
      <p className="text-muted-foreground text-xs">
        Lasso fully encloses marks, then drag to move them. Background exports
        transparent. Drawing uses touch or pointer.
      </p>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          disabled={!marks.length}
          onClick={() => {
            setMarks(marks.slice(0, -1));
            setSelection([]);
          }}
          type="button"
          variant="ghost"
        >
          Undo mark
        </Button>
        {selection.length ? (
          <Button
            onClick={() => {
              setMarks(marks.filter((_, i) => !selection.includes(i)));
              setSelection([]);
            }}
            type="button"
            variant="ghost"
          >
            Remove selected
          </Button>
        ) : null}
        <Button
          disabled={!marks.length}
          onClick={() => {
            const output = document.createElement("canvas");
            output.width = 600;
            output.height = 400;
            const ctx = output.getContext("2d");
            if (!ctx) {
              return;
            }
            for (const mark of marks) {
              paintMark(ctx, mark);
            }
            onUse(output.toDataURL("image/png"));
          }}
          type="button"
        >
          Use drawing
        </Button>
      </div>
    </div>
  );
}
