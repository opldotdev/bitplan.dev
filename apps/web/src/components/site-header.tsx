"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { GitHubStars } from "@/components/github-stars";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { isActivePath, SITE_LINKS } from "@/lib/site-nav";
import { cn } from "@/lib/utils";
import {
  connectBrowserWallet,
  isWalletConnected,
  onWalletChange,
  reconnectAuthenticatedWallet,
} from "@/lib/wallet";

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
  const pathname = usePathname();
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

  const isHome = pathname === "/";

  return (
    <header
      className={cn(
        isHome &&
          "absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-background/55 to-transparent"
      )}
    >
      <div className="mx-auto grid h-14 w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-1 justify-self-start sm:gap-2">
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
                {SITE_LINKS.map((link) => {
                  const isActive = isActivePath(pathname, link.href);
                  return (
                    <Link
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        buttonVariants({ variant: "ghost" }),
                        "justify-start",
                        isActive && "bg-muted text-foreground"
                      )}
                      href={link.href}
                      key={link.href}
                      onClick={closeMenu}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
          <Link
            aria-current={pathname === "/" ? "page" : undefined}
            className="px-2 font-heading font-medium text-foreground no-underline"
            href="/"
          >
            BitPlan
            <span className="text-primary">.</span>
          </Link>
        </div>
        <nav
          aria-label="Primary"
          className="col-start-2 hidden items-center gap-1 md:flex"
        >
          {SITE_LINKS.map((link) => {
            const isActive = isActivePath(pathname, link.href);
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  buttonVariants({ size: "sm", variant: "ghost" }),
                  "px-2 sm:px-4",
                  isActive && "bg-muted text-foreground"
                )}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="col-start-3 flex items-center gap-1 justify-self-end sm:gap-2">
          {connected ? null : (
            <Button
              className="hidden md:inline-flex"
              disabled={connecting}
              onClick={connect}
              size="sm"
              type="button"
              variant="ghost"
            >
              {connecting ? "Connecting…" : "Connect wallet"}
            </Button>
          )}
          <GitHubStars />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
