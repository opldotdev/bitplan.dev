"use client";

import { useEffect, useState } from "react";

import { GitHubIcon } from "@/components/github-icon";
import { Button } from "@/components/ui/button";
import { GITHUB_URL } from "@/lib/site";

const REPOSITORY_API = "https://api.github.com/repos/opldotdev/bitplan.dev";

export function readStarCount(value: unknown): number | null {
  if (!(value && typeof value === "object" && "stargazers_count" in value)) {
    return null;
  }
  const stars = value.stargazers_count;
  return Number.isSafeInteger(stars) && Number(stars) >= 0
    ? Number(stars)
    : null;
}

export function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(REPOSITORY_API, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        const count = readStarCount(result);
        if (count !== null) {
          setStars(count);
        }
      })
      .catch(() => {
        // The GitHub link still works if its optional count cannot load.
      });
    return () => controller.abort();
  }, []);

  return (
    <Button asChild className="sm:min-w-14" size="sm" variant="ghost">
      <a
        aria-label={stars === null ? "GitHub" : `GitHub, ${stars} stars`}
        href={GITHUB_URL}
        rel="noopener noreferrer"
        target="_blank"
      >
        <GitHubIcon className="size-4" />
        {stars === null ? null : (
          <span className="hidden text-xs tabular-nums sm:inline">
            {stars.toLocaleString()}
          </span>
        )}
      </a>
    </Button>
  );
}
