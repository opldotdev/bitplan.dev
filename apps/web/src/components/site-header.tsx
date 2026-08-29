import Link from "next/link";

import { GitHubIcon } from "@/components/github-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-[42rem] items-center justify-between px-6 py-6">
      <Link className="font-semibold text-foreground no-underline" href="/">
        BitPlan
        <span className="text-primary">.</span>
      </Link>
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost">
          <a
            aria-label="GitHub"
            href="https://github.com/b-open-io"
            rel="noopener noreferrer"
            target="_blank"
          >
            <GitHubIcon className="size-4" />
          </a>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
