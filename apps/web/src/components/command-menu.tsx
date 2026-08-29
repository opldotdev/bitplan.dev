"use client";

import { BookOpen, FileLock2, Heart, House, Package } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { GitHubIcon } from "@/components/github-icon";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { GITHUB_URL } from "@/lib/site";
import { DOCS_NAV, SITE_LINKS } from "@/lib/site-nav";

const PAGE_ITEMS = [{ href: "/", label: "Home" }, ...SITE_LINKS];

const RESOURCE_ITEMS = [
  {
    href: "https://www.npmjs.com/package/bitplan",
    icon: Package,
    label: "CLI on npm",
  },
  {
    href: GITHUB_URL,
    icon: GitHubIcon,
    label: "GitHub",
  },
] as const;

export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onSelect = useCallback(
    (value: string) => {
      const href = value.slice(value.lastIndexOf(" ") + 1);
      setOpen(false);
      if (href.startsWith("http")) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      router.push(href);
    },
    [router]
  );

  return (
    <CommandDialog
      description="Jump to a BitPlan page, docs, or the npm CLI."
      onOpenChange={setOpen}
      open={open}
      title="Search BitPlan"
    >
      <Command>
        <CommandInput placeholder="Search pages and docs…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Pages">
            {PAGE_ITEMS.map((link) => (
              <CommandItem
                key={link.href}
                onSelect={onSelect}
                value={`${link.label} ${link.href}`}
              >
                <PageIcon href={link.href} />
                {link.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Docs">
            {DOCS_NAV.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={onSelect}
                value={`${item.label} ${item.href}`}
              >
                <BookOpen />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Resources">
            {RESOURCE_ITEMS.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={onSelect}
                value={`${item.label} ${item.href}`}
              >
                <item.icon />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function PageIcon({ href }: { href: string }) {
  if (href === "/") {
    return <House />;
  }
  if (href === "/docs") {
    return <BookOpen />;
  }
  if (href === "/drafts") {
    return <FileLock2 />;
  }
  if (href === "/sponsors") {
    return <Heart />;
  }
  return <BookOpen />;
}
