"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  createSponsorCheckout,
  type SponsorCheckout,
} from "@/lib/sponsor-checkout";
import {
  drawSponsorImage,
  exportSponsorWebp,
  loadSponsorImage,
  type SponsorCrop,
} from "@/lib/sponsor-image";
import {
  SPONSOR_TEST_SLOT_ID,
  type SponsorSlotState,
  type SponsorTier,
  sponsorPriceSats,
} from "@/lib/sponsors";
import { connectBrowserWalletClient } from "@/lib/wallet";

const DEFAULT_CROP: SponsorCrop = { x: 50, y: 50, zoom: 1 };

class DiscardSponsorCheckoutError extends Error {}

function validatedSponsorUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Sponsor links must use HTTPS.");
  }
  return url.toString();
}

async function ensureSlotAvailable(slotId: string): Promise<void> {
  const response = await fetch(`/api/sponsors/${slotId}`, {
    cache: "no-store",
    method: "HEAD",
  });
  if (response.status === 200) {
    throw new Error("This slot was just sold. Choose another slot.");
  }
  if (response.status !== 404) {
    throw new Error("Sponsor checkout is temporarily unavailable.");
  }
}

async function finalizeCheckout(
  slotId: string,
  checkout: SponsorCheckout
): Promise<boolean> {
  const response = await fetch(`/api/sponsors/${slotId}`, {
    body: checkout.beef,
    headers: { "content-type": "application/octet-stream" },
    method: "POST",
  });
  const result: unknown = await response.json().catch(() => undefined);
  if (response.status === 409) {
    throw new DiscardSponsorCheckoutError(
      "This slot was claimed first. Your transaction was not sent."
    );
  }
  if (response.status === 422) {
    throw new DiscardSponsorCheckoutError(
      "The network rejected the transaction. No payment was accepted; try again."
    );
  }
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result
        ? String(result.error)
        : "The server could not finalize this slot.";
    throw new Error(message);
  }
  return !(
    result &&
    typeof result === "object" &&
    "relayed" in result &&
    result.relayed === false
  );
}

export function SponsorDialog({
  slot,
  tier,
}: {
  slot: SponsorSlotState;
  tier: SponsorTier;
}) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [crop, setCrop] = useState(DEFAULT_CROP);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [name, setName] = useState("");
  const [pendingCheckout, setPendingCheckout] = useState<SponsorCheckout>();
  const [status, setStatus] = useState<string>();
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (canvas && image) {
      drawSponsorImage(canvas, image, tier, crop);
    }
  }, [canvas, crop, image, tier]);

  const selectImage = useCallback(async (file: File | undefined) => {
    setImage(null);
    setCrop(DEFAULT_CROP);
    setStatus(undefined);
    if (!file) {
      return;
    }
    try {
      setImage(await loadSponsorImage(file));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Invalid image.");
    }
  }, []);

  const publishSponsor = useCallback(async () => {
    if (!(pendingCheckout || (canvas && image && acknowledged))) {
      return;
    }
    setBusy(true);
    try {
      let checkout = pendingCheckout;
      if (!checkout) {
        setStatus("Preparing image…");
        const sponsorUrl = validatedSponsorUrl(url);
        const webp = await exportSponsorWebp(canvas as HTMLCanvasElement);
        await ensureSlotAvailable(slot.slotId);

        setStatus("Approve the transaction in your wallet…");
        const wallet = await connectBrowserWalletClient();
        checkout = await createSponsorCheckout({
          image: new Uint8Array(await webp.arrayBuffer()),
          name: name.trim(),
          slotId: slot.slotId,
          tier,
          url: sponsorUrl,
          wallet,
        });
        setPendingCheckout(checkout);
      }

      setStatus("Finalizing your slot…");
      if (!(await finalizeCheckout(slot.slotId, checkout))) {
        setStatus(
          "Your slot is secured, but ARC has not confirmed the transaction. Retry finalization without another wallet payment."
        );
        return;
      }
      setPendingCheckout(undefined);
      setStatus("Published. Your sponsor is live.");
      router.refresh();
    } catch (error) {
      if (error instanceof DiscardSponsorCheckoutError) {
        setPendingCheckout(undefined);
      }
      const message = error instanceof Error ? error.message : "Unknown error.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }, [
    acknowledged,
    image,
    name,
    pendingCheckout,
    router,
    slot.slotId,
    tier,
    url,
  ]);

  const changeName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  }, []);
  const changeUrl = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
  }, []);
  const changeImage = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      selectImage(event.target.files?.[0]);
    },
    [selectImage]
  );
  const changeZoom = useCallback(([zoom]: number[]) => {
    setCrop((current) => ({ ...current, zoom: zoom ?? 1 }));
  }, []);
  const changeX = useCallback(([x]: number[]) => {
    setCrop((current) => ({ ...current, x: x ?? 50 }));
  }, []);
  const changeY = useCallback(([y]: number[]) => {
    setCrop((current) => ({ ...current, y: y ?? 50 }));
  }, []);
  const changeAcknowledged = useCallback(
    (checked: boolean | "indeterminate") => {
      setAcknowledged(checked === true);
    },
    []
  );

  const canSubmit = Boolean(
    (pendingCheckout || (acknowledged && image && name.trim() && url.trim())) &&
      !busy
  );
  const priceBsv = sponsorPriceSats(slot.slotId, tier) / 100_000_000;
  const triggerLabel = `${
    slot.slotId === SPONSOR_TEST_SLOT_ID ? "Test slot" : "Sponsor"
  } · ${priceBsv} BSV`;
  let submitLabel = `Pay ${priceBsv} BSV and publish`;
  if (busy) {
    submitLabel = "Working…";
  } else if (pendingCheckout) {
    submitLabel = "Retry ARC submission";
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          className="size-full cursor-pointer hover:border-foreground/50"
          variant="outline"
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {tier.name} sponsor · {slot.slotId}
          </DialogTitle>
          <DialogDescription>
            Your wallet creates one transaction containing the permanent WebP
            and payment. The first valid transaction received wins this slot.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`${slot.slotId}-name`}>Sponsor name</Label>
            <Input
              id={`${slot.slotId}-name`}
              maxLength={64}
              onChange={changeName}
              placeholder="Acme"
              value={name}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${slot.slotId}-url`}>HTTPS link</Label>
            <Input
              id={`${slot.slotId}-url`}
              inputMode="url"
              onChange={changeUrl}
              placeholder="https://example.com"
              type="url"
              value={url}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${slot.slotId}-image`}>Image</Label>
            <Input
              accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
              id={`${slot.slotId}-image`}
              onChange={changeImage}
              type="file"
            />
            <p className="text-muted-foreground text-xs">
              Up to 20 MiB. Exported as one {tier.imageWidth} ×{" "}
              {tier.imageHeight}
              WebP no larger than 200 KiB.
            </p>
          </div>

          {image ? (
            <div className="grid gap-4">
              <canvas
                aria-label="Sponsor image crop preview"
                className="h-auto w-full rounded-lg border bg-muted"
                ref={setCanvas}
              />
              <div className="grid gap-2">
                <Label>Zoom</Label>
                <Slider
                  aria-label="Crop zoom"
                  max={3}
                  min={1}
                  onValueChange={changeZoom}
                  step={0.05}
                  value={[crop.zoom]}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Horizontal</Label>
                  <Slider
                    aria-label="Horizontal crop position"
                    max={100}
                    min={0}
                    onValueChange={changeX}
                    value={[crop.x]}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Vertical</Label>
                  <Slider
                    aria-label="Vertical crop position"
                    max={100}
                    min={0}
                    onValueChange={changeY}
                    value={[crop.y]}
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex items-start gap-3">
            <Checkbox
              checked={acknowledged}
              id={`${slot.slotId}-rights`}
              onCheckedChange={changeAcknowledged}
            />
            <Label
              className="items-start leading-snug"
              htmlFor={`${slot.slotId}-rights`}
            >
              I own or have permission to publish this image and link
              permanently on Bitcoin.
            </Label>
          </div>
          {status ? (
            <p className="text-muted-foreground text-sm" role="status">
              {status}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button disabled={!canSubmit} onClick={publishSponsor} type="button">
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
