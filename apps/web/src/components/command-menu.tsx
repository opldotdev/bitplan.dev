"use client";

import { BookOpen, FileLock2, Heart, Package } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { GitHubIcon } from "@/components/github-icon";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DOCS_NAV, SITE_LINKS } from "@/lib/site-nav";

const OPEN_EVENT = "bitplan:open-command-menu";

export function openCommandMenu(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const ICONS = {
  "/docs": BookOpen,
  "/drafts": FileLock2,
  "/sponsors": Heart,
} as const;

const DOC_ITEMS = DOCS_NAV.flatMap((group) => group.items);
const RESOURCE_ITEMS = [
  {
    href: "https://www.npmjs.com/package/bitplan",
    icon: Package,
    label: "CLI on npm",
  },
  {
    href: "https://github.com/opldotdev/bitplan.dev",
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
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const onSelect = useCallback(
    (value: string) => {
      const href = value.split(" ")[0] ?? value;
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
      description="Jump to a page or an external resource."
      onOpenChange={setOpen}
      open={open}
      title="Search BitPlan"
    >
      <CommandInput placeholder="Search pages and docs…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Pages">
          {SITE_LINKS.map((link) => {
            const Icon = ICONS[link.href];
            return (
              <CommandItem
                key={link.href}
                onSelect={onSelect}
                value={`${link.href} ${link.label}`}
              >
                <Icon />
                {link.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Docs">
          {DOC_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              onSelect={onSelect}
              value={`${item.href} ${item.label}`}
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
              value={`${item.href} ${item.label}`}
            >
              <item.icon />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
