"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  sponsorWalletErrorMessage,
} from "@/lib/sponsor-checkout";
import {
  exportSponsorWebp,
  type LoadedSponsorImage,
  loadSponsorImage,
  type SourceCrop,
} from "@/lib/sponsor-image";
import {
  SPONSOR_TEST_SLOT_ID,
  type SponsorQuote,
  type SponsorSlotState,
  type SponsorTier,
  sponsorPriceUsd,
} from "@/lib/sponsors";
import { connectBrowserWalletClient } from "@/lib/wallet";

const DEFAULT_CROP: Point = { x: 0, y: 0 };
const TRAILING_DECIMAL_PATTERN = /\.$/;
const TRAILING_ZERO_PATTERN = /0+$/;

class DiscardSponsorCheckoutError extends Error {}

function checkoutAfterError(
  error: unknown,
  checkout: SponsorCheckout | undefined
): SponsorCheckout | undefined {
  return error instanceof DiscardSponsorCheckoutError ? undefined : checkout;
}

function validatedSponsorUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Sponsor links must use HTTPS.");
  }
  return url.toString();
}

function isSponsorQuote(value: unknown): value is SponsorQuote {
  return Boolean(
    value &&
      typeof value === "object" &&
      "priceSats" in value &&
      typeof value.priceSats === "number" &&
      "priceUsd" in value &&
      typeof value.priceUsd === "number" &&
      "bsvUsd" in value &&
      typeof value.bsvUsd === "number" &&
      "slotId" in value &&
      typeof value.slotId === "string"
  );
}

async function getSponsorQuote(slotId: string): Promise<SponsorQuote> {
  const response = await fetch(`/api/sponsors/${slotId}`, {
    cache: "no-store",
  });
  if (response.status === 409) {
    throw new Error("This slot was just sold. Choose another slot.");
  }
  const result: unknown = await response.json().catch(() => undefined);
  if (!(response.ok && isSponsorQuote(result))) {
    throw new Error("Sponsor checkout is temporarily unavailable.");
  }
  return result;
}

function formatBsv(satoshis: number): string {
  return (satoshis / 100_000_000)
    .toFixed(8)
    .replace(TRAILING_ZERO_PATTERN, "")
    .replace(TRAILING_DECIMAL_PATTERN, "");
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
  if (response.status === 400) {
    throw new DiscardSponsorCheckoutError(
      "The transaction needs a fresh price. Try again."
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

async function prepareCheckout({
  area,
  image,
  name,
  onStatus,
  slotId,
  tier,
  url,
}: {
  area: SourceCrop;
  image: LoadedSponsorImage;
  name: string;
  onStatus: (message: string) => void;
  slotId: string;
  tier: SponsorTier;
  url: string;
}): Promise<SponsorCheckout> {
  onStatus("Preparing image…");
  const sponsorUrl = validatedSponsorUrl(url);
  const webp = await exportSponsorWebp(image.element, tier, area);
  onStatus("Getting the current BSV quote…");
  const quote = await getSponsorQuote(slotId);
  onStatus(
    `Approve ${formatBsv(quote.priceSats)} BSV ($${quote.priceUsd}) in your wallet…`
  );
  try {
    const wallet = await connectBrowserWalletClient();
    return await createSponsorCheckout({
      image: new Uint8Array(await webp.arrayBuffer()),
      name: name.trim(),
      quote,
      slotId,
      tier,
      url: sponsorUrl,
      wallet,
    });
  } catch (error) {
    throw new Error(sponsorWalletErrorMessage(error), { cause: error });
  }
}

export function SponsorDialog({
  slot,
  tier,
}: {
  slot: SponsorSlotState;
  tier: SponsorTier;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [crop, setCrop] = useState(DEFAULT_CROP);
  const [croppedArea, setCroppedArea] = useState<SourceCrop>();
  const [image, setImage] = useState<LoadedSponsorImage | null>(null);
  const [name, setName] = useState("");
  const [pendingCheckout, setPendingCheckout] = useState<SponsorCheckout>();
  const [status, setStatus] = useState<string>();
  const [url, setUrl] = useState("");
  const [zoom, setZoom] = useState(1);

  useEffect(
    () => () => {
      if (image) {
        URL.revokeObjectURL(image.url);
      }
    },
    [image]
  );

  const selectImage = useCallback(async (file: File | undefined) => {
    setImage(null);
    setCrop(DEFAULT_CROP);
    setCroppedArea(undefined);
    setStatus(undefined);
    setZoom(1);
    if (!file) {
      return;
    }
    try {
      setImage(await loadSponsorImage(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid image.");
    }
  }, []);

  const completeCrop = useCallback(
    (_area: Area, areaPixels: Area) => setCroppedArea(areaPixels),
    []
  );

  const publishSponsor = useCallback(async () => {
    const selectedArea = croppedArea;
    const selectedImage = image;
    if (!(pendingCheckout || (selectedArea && selectedImage))) {
      return;
    }
    setBusy(true);
    try {
      let checkout = pendingCheckout;
      if (!checkout) {
        if (!(selectedArea && selectedImage)) {
          return;
        }
        checkout = await prepareCheckout({
          area: selectedArea,
          image: selectedImage,
          name,
          onStatus: setStatus,
          slotId: slot.slotId,
          tier,
          url,
        });
        setPendingCheckout(checkout);
      }

      setStatus("Finalizing your slot…");
      if (!(await finalizeCheckout(slot.slotId, checkout))) {
        setStatus(undefined);
        toast.warning(
          "Your slot is secured, but ARC has not confirmed the transaction. Retry finalization without another wallet payment."
        );
        return;
      }
      setPendingCheckout(undefined);
      setStatus(undefined);
      toast.success("Published. Your sponsor is live.");
      router.refresh();
    } catch (error) {
      setPendingCheckout((checkout) => checkoutAfterError(error, checkout));
      const message = error instanceof Error ? error.message : "Unknown error.";
      setStatus(undefined);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [
    croppedArea,
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
  const changeZoom = useCallback(([value]: number[]) => {
    setZoom(value ?? 1);
  }, []);

  const canSubmit = Boolean(
    (pendingCheckout || (croppedArea && image && name.trim() && url.trim())) &&
      !busy
  );
  const priceUsd = sponsorPriceUsd(slot.slotId, tier);
  const triggerLabel = `${
    slot.slotId === SPONSOR_TEST_SLOT_ID ? "Test slot" : "Sponsor"
  } · $${priceUsd}`;
  let submitLabel = `Pay $${priceUsd} and publish`;
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
              <div
                className="relative w-full touch-none overflow-hidden rounded-lg border bg-black"
                style={{
                  aspectRatio: `${tier.imageWidth} / ${tier.imageHeight}`,
                }}
              >
                <Cropper
                  aspect={tier.imageWidth / tier.imageHeight}
                  crop={crop}
                  image={image.url}
                  onCropChange={setCrop}
                  onCropComplete={completeCrop}
                  onZoomChange={setZoom}
                  roundCropAreaPixels
                  zoom={zoom}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Drag to reposition. Scroll or pinch to zoom.
              </p>
              <div className="grid gap-2">
                <Label htmlFor={`${slot.slotId}-zoom`}>Zoom</Label>
                <Slider
                  aria-label="Crop zoom"
                  id={`${slot.slotId}-zoom`}
                  max={3}
                  min={1}
                  onValueChange={changeZoom}
                  step={0.05}
                  value={[zoom]}
                />
              </div>
            </div>
          ) : null}

          <p className="min-h-5 text-muted-foreground text-sm" role="status">
            {status}
          </p>
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
