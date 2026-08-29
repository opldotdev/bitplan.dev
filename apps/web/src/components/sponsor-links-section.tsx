"use client";

import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { SponsorDialog } from "@/components/sponsor-dialog";
import { Button } from "@/components/ui/button";
import {
  SPONSOR_LINK_SLOT_ID,
  SPONSOR_LINK_TIER,
  type SponsorLink,
} from "@/lib/sponsors";

interface SponsorLinksPage {
  items: SponsorLink[];
  nextOffset: number | null;
  total: number;
}

function isSponsorLinksPage(value: unknown): value is SponsorLinksPage {
  return Boolean(
    value &&
      typeof value === "object" &&
      "items" in value &&
      Array.isArray(value.items) &&
      "nextOffset" in value
  );
}

function SponsorLinkRow({ link }: { link: SponsorLink }) {
  return (
    <li>
      <a
        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 no-underline transition-colors hover:bg-muted/50"
        href={link.href}
        rel="sponsored noopener"
        target="_blank"
      >
        <Image
          alt=""
          className="size-5 shrink-0 rounded-[5px]"
          height={20}
          src={link.iconUrl}
          unoptimized
          width={20}
        />
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span className="shrink-0 font-medium text-foreground text-sm">
            {link.name}
          </span>
          {link.blurb ? (
            <span className="truncate text-muted-foreground text-sm">
              {link.blurb}
            </span>
          ) : null}
        </span>
        <ArrowUpRightIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      </a>
    </li>
  );
}

export function SponsorLinksSection({
  initialItems,
  initialNextOffset,
}: {
  initialItems: SponsorLink[];
  initialNextOffset: number | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: the ref is set while a fetch is in flight.
    if (loadingRef.current || nextOffset === null) {
      return;
    }
    loadingRef.current = true;
    try {
      const response = await fetch(`/api/sponsors/links?offset=${nextOffset}`);
      const page: unknown = await response.json().catch(() => undefined);
      if (!(response.ok && isSponsorLinksPage(page))) {
        return;
      }
      setItems((existing) => {
        const seen = new Set(existing.map((link) => link.txid));
        return [
          ...existing,
          ...page.items.filter((link) => !seen.has(link.txid)),
        ];
      });
      setNextOffset(page.nextOffset);
    } finally {
      loadingRef.current = false;
    }
  }, [nextOffset]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: React assigns the ref after render.
    if (!sentinel || nextOffset === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: "320px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, nextOffset]);

  return (
    <div className="flex flex-col gap-4 pt-4">
      <SponsorDialog
        slot={{ slotId: SPONSOR_LINK_SLOT_ID, status: "available" }}
        tier={SPONSOR_LINK_TIER}
        trigger={
          <Button
            className="h-11 w-full cursor-pointer border-border/60 border-dashed bg-transparent font-mono text-muted-foreground text-xs uppercase tracking-wide hover:border-foreground/50 hover:bg-muted/30 hover:text-foreground"
            variant="outline"
          >
            Add your link
          </Button>
        }
      />
      {items.length > 0 ? (
        <ul className="-mx-3 flex flex-col">
          {items.map((link) => (
            <SponsorLinkRow key={link.txid} link={link} />
          ))}
        </ul>
      ) : (
        <p className="px-3 text-muted-foreground text-sm">
          No links yet. Yours would be first.
        </p>
      )}
      {nextOffset === null ? null : <div aria-hidden ref={sentinelRef} />}
    </div>
  );
}
