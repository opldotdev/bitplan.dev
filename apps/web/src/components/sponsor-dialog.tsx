"use client";

import { buyOrdinal, createContext, sendOrdinals } from "@1sat/actions";
import { OneSatServices } from "@1sat/client";
import { Beef, Utils, type WalletInterface } from "@bsv/sdk";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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
  drawSponsorImage,
  exportSponsorWebp,
  loadSponsorImage,
  type SponsorCrop,
} from "@/lib/sponsor-image";
import {
  SPONSOR_APP,
  SPONSOR_CONTENT_TYPE,
  SPONSOR_SUBTYPE,
  type SponsorSlotState,
  type SponsorTier,
} from "@/lib/sponsors";
import { connectBrowserWalletClient } from "@/lib/wallet";

interface ActionResult {
  actionId?: string;
  error?: string;
  tx?: number[];
  txid?: string;
}

class SlotReservedError extends Error {}

const DEFAULT_CROP: SponsorCrop = { x: 50, y: 50, zoom: 1 };
const TRAILING_SLASH_PATTERN = /\/$/;

function actionError(result: ActionResult, fallback: string): Error | null {
  if (result.error) {
    return new Error(result.error);
  }
  if (!result.txid) {
    return new Error(fallback);
  }
  return null;
}

async function relayResult(
  services: OneSatServices,
  result: ActionResult
): Promise<boolean> {
  if (!result.txid) {
    return false;
  }
  try {
    const beef = result.tx
      ? Beef.fromBinary(result.tx)
      : await services.getBeefForTxid(result.txid);
    await services.postBeef(beef, [result.txid]);
    return true;
  } catch {
    return false;
  }
}

async function findOwnedSlotId(
  wallet: WalletInterface,
  origin: string,
  purchase?: ActionResult
): Promise<string> {
  if (purchase?.actionId) {
    return `${purchase.actionId}_0`;
  }
  const result = await wallet.listOutputs({
    basket: "1sat",
    includeTags: true,
    limit: 100,
    tagQueryMode: "all",
    tags: [`origin:${origin}`],
  });
  const preferred = purchase?.txid
    ? result.outputs.find((candidate) =>
        candidate.outpoint.replace(".", "_").startsWith(`${purchase.txid}_`)
      )
    : undefined;
  const output = preferred ?? result.outputs[0];
  const id = output?.tags?.find((tag) => tag.startsWith("id:"))?.slice(3);
  if (!id) {
    throw new Error(
      "This wallet does not contain the purchased slot. Connect the wallet that bought it."
    );
  }
  return id;
}

function validatedSponsorUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Sponsor links must use HTTPS.");
  }
  return url.toString();
}

async function acquireSponsorSlot({
  context,
  ownedId,
  services,
  slot,
  updateStatus,
  wallet,
}: {
  context: ReturnType<typeof createContext>;
  ownedId?: string;
  services: OneSatServices;
  slot: SponsorSlotState & { origin: string };
  updateStatus: (message: string) => void;
  wallet: WalletInterface;
}): Promise<string> {
  if (ownedId) {
    return ownedId;
  }
  if (slot.listing) {
    updateStatus(
      `Approve ${slot.listing.priceSats.toLocaleString()} sats in your wallet…`
    );
    const purchase = (await buyOrdinal.execute(context, {
      origin: slot.origin,
      outpoint: slot.listing.outpoint,
    })) as ActionResult;
    const actionFailure = actionError(
      purchase,
      "The wallet did not return a purchase transaction."
    );
    if (actionFailure) {
      throw actionFailure;
    }
    await relayResult(services, purchase);
    try {
      return await findOwnedSlotId(wallet, slot.origin, purchase);
    } catch (cause) {
      throw new SlotReservedError(
        cause instanceof Error
          ? cause.message
          : "The purchased slot was not found.",
        { cause }
      );
    }
  }
  updateStatus("Finding this slot in your wallet…");
  return findOwnedSlotId(wallet, slot.origin);
}

export function SponsorDialog({
  slot,
  tier,
}: {
  slot: SponsorSlotState;
  tier: SponsorTier;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [crop, setCrop] = useState(DEFAULT_CROP);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [name, setName] = useState("");
  const [ownedId, setOwnedId] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [url, setUrl] = useState("");

  useEffect(() => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: the ref is populated after the canvas mounts.
    if (canvasRef.current && image) {
      drawSponsorImage(canvasRef.current, image, tier, crop);
    }
  }, [crop, image, tier]);

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
    const canvas = canvasRef.current;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: the canvas can unmount before this callback runs.
    if (!(canvas && image && slot.origin && acknowledged)) {
      return;
    }
    setBusy(true);
    setStatus("Preparing image…");
    let ownsSlot = Boolean(ownedId);
    try {
      const sponsorUrl = validatedSponsorUrl(url);
      const webp = await exportSponsorWebp(canvas);
      const wallet = await connectBrowserWalletClient();
      const gateway = (
        process.env.NEXT_PUBLIC_ORDFS_GATEWAY_URL ?? "https://api.1sat.app"
      ).replace(TRAILING_SLASH_PATTERN, "");
      const services = new OneSatServices("main", gateway);
      const context = createContext(wallet, { services });

      const id = await acquireSponsorSlot({
        context,
        ownedId,
        services,
        slot: { ...slot, origin: slot.origin },
        updateStatus: setStatus,
        wallet,
      });
      setOwnedId(id);
      ownsSlot = true;

      setStatus("Slot reserved. Approve publishing the permanent image…");
      const bytes = new Uint8Array(await webp.arrayBuffer());
      const publish = (await sendOrdinals.execute(context, {
        transfers: [
          {
            counterparty: "self",
            id,
            inscription: {
              base64Content: Utils.toBase64(Array.from(bytes)),
              contentType: SPONSOR_CONTENT_TYPE,
            },
            map: {
              app: SPONSOR_APP,
              name: name.trim(),
              subType: SPONSOR_SUBTYPE,
              subTypeData: JSON.stringify({
                href: sponsorUrl,
                schema: 1,
                slot: slot.slotId,
                tier: tier.id,
              }),
              type: "ord",
            },
          },
        ],
      })) as ActionResult;
      const publishError = actionError(
        publish,
        "The wallet did not return a publishing transaction."
      );
      if (publishError) {
        throw publishError;
      }
      const relayed = await relayResult(services, publish);
      setStatus(
        relayed
          ? "Published. Your sponsor will appear after OrdFS indexes the transaction."
          : "Published. Indexing may take a little longer because the relay was unavailable."
      );
      router.refresh();
    } catch (error) {
      ownsSlot = ownsSlot || error instanceof SlotReservedError;
      const message = error instanceof Error ? error.message : "Unknown error.";
      setStatus(
        ownsSlot
          ? `Your slot is reserved, but publishing failed: ${message} You can retry without paying again.`
          : `Nothing was purchased: ${message}`
      );
    } finally {
      setBusy(false);
    }
  }, [acknowledged, image, name, ownedId, router, slot, tier, url]);

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
    acknowledged && image && name.trim() && url.trim() && !busy
  );
  const triggerLabel = slot.listing
    ? `Sponsor · ${slot.listing.priceSats.toLocaleString()} sats`
    : "Finish sponsor";
  let submitLabel = "Publish sponsor";
  if (busy) {
    submitLabel = "Working…";
  } else if (slot.listing && !ownedId) {
    submitLabel = "Buy and publish";
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="size-full border-dashed" variant="outline">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {tier.name} sponsor · {slot.slotId}
          </DialogTitle>
          <DialogDescription>
            {slot.listing
              ? "Your wallet buys this unique slot first, then publishes one permanent WebP on its ordinal."
              : "Connect the wallet that reserved this slot to finish its permanent inscription."}
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
                ref={canvasRef}
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
