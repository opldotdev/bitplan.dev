"use client";

import { ImagePlus, Upload } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { AnnotationSketch } from "@/components/annotation-sketch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { prepareAnnotationImage } from "@/lib/annotation-image";

export function AnnotationImagePicker({
  onLoad,
  initiallyOpen = false,
  onClose,
}: {
  onLoad: (dataUrl: string) => void | Promise<void>;
  initiallyOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [tab, setTab] = useState<"photos" | "stickers" | "draw">("stickers");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function choose(file: Blob) {
    setBusy(true);
    setError(null);
    try {
      setPreview(await prepareAnnotationImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare image.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          if (!value) {
            onClose?.();
          }
        }
      }}
      open={open}
    >
      {initiallyOpen ? null : (
        <DialogTrigger asChild>
          <Button className="min-h-11 w-full" type="button" variant="outline">
            <ImagePlus className="size-4" />
            Photos, stickers & drawings
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className="sm:max-h-[90dvh] sm:max-w-xl sm:overflow-y-auto"
        onPaste={(event) => {
          const [file] = event.clipboardData.files;
          if (file && !busy) {
            event.preventDefault();
            void choose(file);
          }
        }}
      >
        <DialogTitle>Add an image</DialogTitle>
        <DialogDescription>
          Choose a photo, drop an image, or make a drawing. Image bytes are
          encrypted with your annotation.
        </DialogDescription>
        <fieldset className="border-0 p-0">
          <legend className="sr-only">Image sources</legend>
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            {(["photos", "stickers", "draw"] as const).map((value) => (
              <Button
                aria-pressed={tab === value}
                className="min-h-11 flex-1"
                key={value}
                onClick={() => setTab(value)}
                type="button"
                variant={tab === value ? "secondary" : "ghost"}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </Button>
            ))}
          </div>
        </fieldset>
        {tab === "draw" ? (
          <AnnotationSketch
            onUse={(value) => {
              setPreview(value);
              setTab("photos");
            }}
          />
        ) : (
          <>
            {tab === "photos" ? (
              <button
                className="flex min-h-32 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-sm hover:bg-muted"
                disabled={busy}
                onClick={() => input.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const [file] = event.dataTransfer.files;
                  if (file && !busy) {
                    void choose(file);
                  }
                }}
                type="button"
              >
                <Upload className="size-6" />
                <span>Choose from Photos or Files</span>
                <span className="text-muted-foreground text-xs">
                  Drop or paste an image · photos resized automatically
                </span>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <button
                  aria-label="Choose planning papers sticker"
                  className="aspect-square rounded-xl border p-3 hover:bg-muted"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const response = await fetch("/planning-sticker.png");
                      if (!response.ok) {
                        throw new Error("Sticker unavailable.");
                      }
                      await choose(await response.blob());
                    } catch {
                      setError("Could not load sticker. Try again.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  type="button"
                >
                  <Image
                    alt=""
                    className="h-full w-full object-contain"
                    height={160}
                    src="/planning-sticker.png"
                    width={160}
                  />
                </button>
                <button
                  className="aspect-square rounded-xl border border-dashed p-3 text-xs"
                  onClick={() => input.current?.click()}
                  type="button"
                >
                  Add your own
                  <br />
                  transparent PNG
                </button>
              </div>
            )}
            {preview ? (
              <div className="flex h-52 items-center justify-center rounded-xl bg-muted/40 p-3">
                <Image
                  alt="Selected preview"
                  className="max-h-full max-w-full object-contain"
                  height={512}
                  src={preview}
                  unoptimized
                  width={512}
                />
              </div>
            ) : null}
          </>
        )}
        <input
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          aria-label="Choose annotation image file"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void choose(file);
            }
            event.target.value = "";
          }}
          ref={input}
          type="file"
        />
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 pb-[env(safe-area-inset-bottom)]">
          <span className="text-muted-foreground text-xs" role="status">
            {busy ? "Preparing image…" : "Hosted annotation · not yet on chain"}
          </span>
          <Button
            className="min-h-11"
            disabled={!preview || busy}
            onClick={async () => {
              if (!preview) {
                return;
              }
              setBusy(true);
              try {
                await onLoad(preview);
                setOpen(false);
                setPreview(null);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not add image."
                );
              } finally {
                setBusy(false);
              }
            }}
            type="button"
          >
            Use image
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
