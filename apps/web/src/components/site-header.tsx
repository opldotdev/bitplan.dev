"use client";

import { MenuIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { openCommandMenu } from "@/components/command-menu";
import { GitHubIcon } from "@/components/github-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SITE_LINKS } from "@/lib/site-nav";
import {
  connectBrowserWallet,
  isWalletConnected,
  onWalletChange,
  reconnectAuthenticatedWallet,
} from "@/lib/wallet";

function SheetNavLink({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Button asChild className="justify-start" variant="ghost">
      <Link href={href} onClick={onNavigate}>
        {label}
      </Link>
    </Button>
  );
}

function subscribeConnected(onStoreChange: () => void): () => void {
  return onWalletChange(onStoreChange);
}

const serverSnapshot = () => false;

export function SiteHeader() {
  const connected = useSyncExternalStore(
    subscribeConnected,
    isWalletConnected,
    serverSnapshot
  );
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    reconnectAuthenticatedWallet();
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      await connectBrowserWallet();
      router.push("/drafts");
    } catch {
      router.push("/drafts");
    } finally {
      setConnecting(false);
    }
  }, [router]);

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-4">
      <div className="flex items-center gap-1">
        <Sheet onOpenChange={setMenuOpen} open={menuOpen}>
          <SheetTrigger asChild>
            <Button
              aria-label="Open menu"
              className="md:hidden"
              size="icon"
              type="button"
              variant="ghost"
            >
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-72" side="left">
            <SheetHeader>
              <SheetTitle>BitPlan</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-2">
              {SITE_LINKS.map((link) => (
                <SheetNavLink
                  href={link.href}
                  key={link.href}
                  label={link.label}
                  onNavigate={closeMenu}
                />
              ))}
            </nav>
          </SheetContent>
        </Sheet>
        <Link
          className="px-2 font-semibold text-foreground no-underline"
          href="/"
        >
          BitPlan
          <span className="text-primary">.</span>
        </Link>
        <nav className="hidden items-center md:flex">
          {SITE_LINKS.map((link) => (
            <Button asChild key={link.href} size="sm" variant="ghost">
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-1">
        <Button
          className="hidden text-muted-foreground sm:inline-flex"
          onClick={openCommandMenu}
          size="sm"
          type="button"
          variant="outline"
        >
          <SearchIcon data-icon="inline-start" />
          Search
          <Kbd className="ml-2">⌘K</Kbd>
        </Button>
        {!connected && (
          <Button
            disabled={connecting}
            onClick={connect}
            size="sm"
            type="button"
            variant="ghost"
          >
            {connecting ? "Connecting…" : "Connect wallet"}
          </Button>
        )}
        <Button asChild size="icon" variant="ghost">
          <a
            aria-label="GitHub"
            href="https://github.com/opldotdev/bitplan.dev"
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
