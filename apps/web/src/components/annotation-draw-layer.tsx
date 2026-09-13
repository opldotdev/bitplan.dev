"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type DrawingPoint,
  type DrawingTool,
  drawingAsset,
} from "@/lib/drawing-asset";

export function AnnotationDrawLayer({
  tool,
  color,
  onSave,
  onCancel,
}: {
  tool: DrawingTool;
  color: string;
  onSave: (asset: ReturnType<typeof drawingAsset>) => Promise<void>;
  onCancel: () => void;
}) {
  const gesture = useRef<DrawingPoint[] | null>(null);
  const [asset, setAsset] = useState<ReturnType<typeof drawingAsset> | null>(
    null
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(value: ReturnType<typeof drawingAsset>) {
    setBusy(true);
    try {
      await onSave(value);
      onCancel();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save. Your drawing is retained."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div
        aria-label={`Draw ${tool} on the plan`}
        className="pointer-events-auto absolute inset-0 z-30 cursor-crosshair touch-none"
        onPointerCancel={() => {
          gesture.current = null;
          setAsset(null);
        }}
        onPointerDown={(event) => {
          if (busy || event.button !== 0) {
            return;
          }
          event.preventDefault();
          const r = event.currentTarget.getBoundingClientRect();
          gesture.current = [
            { x: event.clientX - r.left, y: event.clientY - r.top },
          ];
          setAsset(null);
          setError("");
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const points = gesture.current;
          // biome-ignore lint/suspicious/noUnnecessaryConditions: ref changes across independent pointer events
          if (!points || points.length >= 5000) {
            return;
          }
          const r = event.currentTarget.getBoundingClientRect();
          points.push({
            x: Math.max(0, Math.min(r.width, event.clientX - r.left)),
            y: Math.max(0, Math.min(r.height, event.clientY - r.top)),
          });
          try {
            setAsset(drawingAsset(tool, points, color));
          } catch (failure) {
            setError((failure as Error).message);
          }
        }}
        onPointerUp={() => {
          const points = gesture.current;
          gesture.current = null;
          // biome-ignore lint/suspicious/noUnnecessaryConditions: pointerup may follow cancellation
          if (!points || points.length < 2) {
            return;
          }
          try {
            const next = drawingAsset(tool, points, color);
            setAsset(next);
            void save(next);
          } catch (failure) {
            setError((failure as Error).message);
          }
        }}
        role="img"
      >
        {asset ? (
          // biome-ignore lint/performance/noImgElement: local SVG preview must retain exact document-pixel dimensions
          <img
            alt="Drawing preview"
            className="pointer-events-none absolute"
            height={asset.size.height}
            src={asset.dataUrl}
            style={{ left: asset.point.x, top: asset.point.y }}
            width={asset.size.width}
          />
        ) : null}
      </div>
      <div className="pointer-events-auto absolute bottom-16 left-4 z-40 flex max-w-[90%] items-center gap-2 rounded-lg border bg-background p-2 text-sm shadow-sm">
        <span role="status">
          {busy ? "Saving drawing…" : error || `Drag to draw ${tool}`}
        </span>
        {error && asset ? (
          <Button disabled={busy} onClick={() => void save(asset)} size="sm">
            Retry
          </Button>
        ) : null}
        <Button disabled={busy} onClick={onCancel} size="sm" variant="ghost">
          Cancel
        </Button>
      </div>
    </>
  );
}
