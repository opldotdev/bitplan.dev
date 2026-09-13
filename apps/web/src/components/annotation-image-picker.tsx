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
import { Textarea } from "@/components/ui/textarea";
import { prepareAnnotationImage } from "@/lib/annotation-image";
import {
  GENERATION_PROMPT_LIMIT,
  pendingSticker,
  STICKERS,
} from "@/lib/annotation-stickers";

export function AnnotationImagePicker({
  onLoad,
  initiallyOpen = false,
  onClose,
}: {
  onLoad: (dataUrl: string, alt?: string) => void | Promise<void>;
  initiallyOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [tab, setTab] = useState<"photos" | "stickers" | "draw" | "generate">(
    "stickers"
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function choose(file: Blob, description = "Uploaded image") {
    setBusy(true);
    setError(null);
    try {
      setPreview(await prepareAnnotationImage(file));
      setAlt(description);
      setTab("photos");
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
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
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
          Stickers, photos, and sketches. Encrypted with your annotation.
        </DialogDescription>
        <fieldset className="border-0 p-0">
          <legend className="sr-only">Image sources</legend>
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            {(["stickers", "photos", "draw", "generate"] as const).map(
              (value) => (
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
              )
            )}
          </div>
        </fieldset>
        {tab === "generate" ? (
          <div className="space-y-3">
            <label className="text-sm" htmlFor="sticker-request">
              What should your agent create?
            </label>
            <Textarea
              id="sticker-request"
              maxLength={GENERATION_PROMPT_LIMIT}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="A paper-cut mountain to mark our next milestone…"
              value={prompt}
            />
            <p className="text-muted-foreground text-sm">
              Places a request here. Your agent can read it with the annotations
              and create the image on its next pass. No model runs now.
            </p>
          </div>
        ) : null}
        {tab === "draw" ? (
          <AnnotationSketch
            onUse={(value) => {
              setPreview(value);
              setAlt("Drawing");
              setTab("photos");
            }}
          />
        ) : null}
        {tab === "photos" || tab === "stickers" ? (
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
                {STICKERS.map((sticker) => (
                  <button
                    aria-label={`Choose ${sticker.name} sticker`}
                    className="flex aspect-square min-w-0 flex-col items-center gap-2 rounded-xl border p-3 hover:bg-muted"
                    disabled={busy}
                    key={sticker.src}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const response = await fetch(sticker.src);
                        if (!response.ok) {
                          throw new Error("Sticker unavailable.");
                        }
                        await choose(await response.blob(), sticker.name);
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
                      className="min-h-0 w-full flex-1 object-contain"
                      height={160}
                      src={sticker.src}
                      width={160}
                    />
                    <span className="text-xs">{sticker.name}</span>
                  </button>
                ))}
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
        ) : null}
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
            disabled={busy || (tab === "generate" ? !prompt.trim() : !preview)}
            onClick={async () => {
              if (!preview && tab !== "generate") {
                return;
              }
              setBusy(true);
              try {
                const image =
                  tab === "generate"
                    ? pendingSticker(prompt)
                    : { alt, dataUrl: preview as string };
                await onLoad(image.dataUrl, image.alt);
                setOpen(false);
                setPreview(null);
                setPrompt("");
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
            {tab === "generate" ? "Place request" : "Use image"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
