const OUTPOINT_PATTERN = /^[0-9a-f]{64}[._]\d+$/i;
const TRAILING_SLASH_PATTERN = /\/$/;

export const SPONSOR_APP = "bitplan";
export const SPONSOR_CONTENT_TYPE = "image/webp";
export const SPONSOR_SUBTYPE = "bitplanSponsorSlot";

export type SponsorTierId = "diamond" | "gold" | "platinum" | "silver";

export interface SponsorTier {
  gridClassName: string;
  id: SponsorTierId;
  imageHeight: number;
  imageWidth: number;
  name: string;
  priceUsd: number;
  slotClassName: string;
  slotIds: readonly string[];
}

export interface Sponsor {
  imageOutpoint: string;
  name: string;
  origin: string;
  slotId: string;
  url: string;
}

export interface SponsorListing {
  outpoint: string;
  priceSats: number;
}

export interface SponsorSlotState {
  error?: string;
  listing?: SponsorListing;
  origin?: string;
  slotId: string;
  sponsor?: Sponsor;
  status: "available" | "paused" | "reserved" | "sponsored";
}

interface IndexedListing {
  data?: Record<string, unknown>;
  outpoint: string;
}

interface SponsorMetadata {
  contentLength: number;
  contentType: string;
  map?: Record<string, unknown>;
  origin?: string;
  outpoint: string;
}

export interface SponsorServices {
  market: {
    getListingsByOrigins: (
      origins: string[]
    ) => Promise<Record<string, IndexedListing>>;
  };
  ordfs: {
    bulkMetadata: (
      outpoints: string[]
    ) => Promise<Record<string, SponsorMetadata | null>>;
  };
}

function createTier({
  gridClassName,
  id,
  imageHeight,
  imageWidth,
  name,
  priceUsd,
  slotClassName,
  slots,
}: Omit<SponsorTier, "slotIds"> & { slots: number }): SponsorTier {
  return {
    gridClassName,
    id,
    imageHeight,
    imageWidth,
    name,
    priceUsd,
    slotClassName,
    slotIds: Array.from({ length: slots }, (_, index) => `${id}-${index + 1}`),
  };
}

export const SPONSOR_TIERS: readonly SponsorTier[] = [
  createTier({
    gridClassName: "grid-cols-1 sm:grid-cols-2",
    id: "diamond",
    imageHeight: 256,
    imageWidth: 828,
    name: "Diamond",
    priceUsd: 500,
    slotClassName: "aspect-[828/256]",
    slots: 4,
  }),
  createTier({
    gridClassName: "grid-cols-2 sm:grid-cols-3",
    id: "platinum",
    imageHeight: 192,
    imageWidth: 640,
    name: "Platinum",
    priceUsd: 250,
    slotClassName: "aspect-[640/192]",
    slots: 6,
  }),
  createTier({
    gridClassName: "grid-cols-2 sm:grid-cols-4",
    id: "gold",
    imageHeight: 192,
    imageWidth: 512,
    name: "Gold",
    priceUsd: 100,
    slotClassName: "aspect-[512/192]",
    slots: 8,
  }),
  createTier({
    gridClassName: "grid-cols-3 sm:grid-cols-6",
    id: "silver",
    imageHeight: 128,
    imageWidth: 384,
    name: "Silver",
    priceUsd: 50,
    slotClassName: "aspect-[384/128]",
    slots: 12,
  }),
];

const TIERS_BY_ID = new Map(SPONSOR_TIERS.map((tier) => [tier.id, tier]));
const SLOT_IDS = new Set(SPONSOR_TIERS.flatMap((tier) => tier.slotIds));

function normalizeOutpoint(value: string): string | null {
  const normalized = value.trim().replace(".", "_");
  return OUTPOINT_PATTERN.test(normalized) ? normalized : null;
}

export function parseSponsorSlotOrigins(
  value: string | undefined
): ReadonlyMap<string, string> {
  if (!value?.trim()) {
    return new Map();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return new Map();
  }
  if (!(parsed && typeof parsed === "object") || Array.isArray(parsed)) {
    return new Map();
  }

  const slots = new Map<string, string>();
  const origins = new Set<string>();
  for (const [slotId, rawOrigin] of Object.entries(parsed)) {
    if (!SLOT_IDS.has(slotId) || typeof rawOrigin !== "string") {
      continue;
    }
    const origin = normalizeOutpoint(rawOrigin);
    if (!origin || origins.has(origin)) {
      continue;
    }
    slots.set(slotId, origin);
    origins.add(origin);
  }
  return slots;
}

function readString(
  record: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : undefined;
}

function readListing(
  listing: IndexedListing | undefined,
  origin: string
): SponsorListing | undefined {
  if (!listing) {
    return;
  }
  const outpoint = normalizeOutpoint(listing.outpoint);
  const ordlock = listing.data?.ordlock;
  if (!(outpoint && ordlock && typeof ordlock === "object")) {
    return;
  }
  const record = ordlock as Record<string, unknown>;
  const listedOrigin = normalizeOutpoint(readString(record, "origin") ?? "");
  const priceSats = record.price;
  if (
    listedOrigin !== origin ||
    typeof priceSats !== "number" ||
    !Number.isSafeInteger(priceSats) ||
    priceSats <= 0
  ) {
    return;
  }
  return { outpoint, priceSats };
}

function readHttpsUrl(value: string | undefined): string | undefined {
  if (!value) {
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      return;
    }
    return url.toString();
  } catch {
    // Invalid URL.
  }
}

function readSubTypeData(
  map: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const value = readString(map, "subTypeData");
  if (!value) {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    // Invalid subtype data.
  }
}

function tierForSlot(slotId: string): SponsorTier | undefined {
  return TIERS_BY_ID.get(slotId.split("-")[0] as SponsorTierId);
}

function resolveConfiguredSlot({
  configuredSlotId,
  listing,
  meta,
  origin,
}: {
  configuredSlotId: string;
  listing?: IndexedListing;
  meta: SponsorMetadata | null;
  origin: string;
}): SponsorSlotState {
  const map = meta?.map;
  const subTypeData = readSubTypeData(map);
  const tier = tierForSlot(configuredSlotId);
  const metadataMatches =
    meta?.origin !== undefined &&
    normalizeOutpoint(meta.origin) === origin &&
    readString(map, "app") === SPONSOR_APP &&
    readString(map, "type") === "ord" &&
    readString(map, "subType") === SPONSOR_SUBTYPE &&
    subTypeData?.schema === 1 &&
    readString(subTypeData, "slot") === configuredSlotId &&
    readString(subTypeData, "tier") === tier?.id;
  if (!(metadataMatches && meta)) {
    return {
      error: "Slot metadata does not match its authorized origin.",
      origin,
      slotId: configuredSlotId,
      status: "paused",
    };
  }

  const activeListing = readListing(listing, origin);
  const rawName = readString(map, "name");
  const name = rawName && rawName.length <= 64 ? rawName : undefined;
  const url = readHttpsUrl(readString(subTypeData, "href"));
  const imageOutpoint = normalizeOutpoint(meta.outpoint);
  const validImage =
    meta.contentType.split(";")[0]?.trim() === SPONSOR_CONTENT_TYPE &&
    meta.contentLength > 0 &&
    meta.contentLength <= 200 * 1024;

  if (name && url && imageOutpoint && validImage) {
    return {
      origin,
      slotId: configuredSlotId,
      sponsor: {
        imageOutpoint,
        name,
        origin,
        slotId: configuredSlotId,
        url,
      },
      status: "sponsored",
    };
  }

  return {
    ...(activeListing ? { listing: activeListing } : {}),
    origin,
    slotId: configuredSlotId,
    status: activeListing ? "available" : "reserved",
  };
}

export async function resolveSponsorSlots({
  configuredSlots,
  services,
}: {
  configuredSlots: ReadonlyMap<string, string>;
  services: SponsorServices;
}): Promise<ReadonlyMap<string, SponsorSlotState>> {
  const states = new Map<string, SponsorSlotState>();
  if (configuredSlots.size === 0) {
    return states;
  }

  const origins = [...configuredSlots.values()];
  const metadataPointers = origins.map((origin) => `${origin}:-1`);
  const [listingsResult, metadataResult] = await Promise.allSettled([
    services.market.getListingsByOrigins(origins),
    services.ordfs.bulkMetadata(metadataPointers),
  ]);
  const listings =
    listingsResult.status === "fulfilled" ? listingsResult.value : {};
  const listingsByOrigin = new Map(
    Object.entries(listings).flatMap(([key, listing]) => {
      const origin = normalizeOutpoint(key);
      return origin ? [[origin, listing] as const] : [];
    })
  );
  const metadata =
    metadataResult.status === "fulfilled" ? metadataResult.value : {};

  for (const [configuredSlotId, origin] of configuredSlots) {
    const meta = metadata[`${origin}:-1`] ?? metadata[origin] ?? null;
    states.set(
      configuredSlotId,
      resolveConfiguredSlot({
        configuredSlotId,
        listing: listingsByOrigin.get(origin),
        meta,
        origin,
      })
    );
  }

  return states;
}

export async function loadSponsorSlots(): Promise<
  ReadonlyMap<string, SponsorSlotState>
> {
  const configuredSlots = parseSponsorSlotOrigins(
    process.env.NEXT_PUBLIC_SPONSOR_SLOT_ORIGINS
  );
  if (configuredSlots.size === 0) {
    return new Map();
  }
  const { OneSatServices } = await import("@1sat/client");
  const services = new OneSatServices(
    "main",
    process.env.NEXT_PUBLIC_ORDFS_GATEWAY_URL
  );
  return resolveSponsorSlots({ configuredSlots, services });
}

export function sponsorImageUrl(
  imageOutpoint: string,
  tier: SponsorTier
): string {
  const gateway = (
    process.env.NEXT_PUBLIC_ORDFS_GATEWAY_URL ?? "https://api.1sat.app"
  ).replace(TRAILING_SLASH_PATTERN, "");
  return `${gateway}/1sat/ordfs/image/${imageOutpoint}?w=${tier.imageWidth}&h=${tier.imageHeight}&fit=pad&f=webp&q=80`;
}
