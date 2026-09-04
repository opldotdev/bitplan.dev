"use client";

import { useEffect } from "react";

import { DraftResolving } from "@/components/draft-viewer";

export function transitionedDraftHref(origin: string, hash: string): string {
  return `/d/${origin}${hash}`;
}

export function HostedDraftRedirect({ origin }: { origin: string }) {
  useEffect(() => {
    window.location.replace(
      transitionedDraftHref(origin, window.location.hash)
    );
  }, [origin]);

  return <DraftResolving />;
}
