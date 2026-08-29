"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { DOCS_NAV } from "@/lib/site-nav";
import { cn } from "@/lib/utils";

interface DocsNavProps {
  className?: string;
  layout?: "rail" | "wrap";
}

export function DocsNav({ className, layout = "rail" }: DocsNavProps) {
  const pathname = usePathname();
  const isWrap = layout === "wrap";

  return (
    <nav
      aria-label="Docs"
      className={cn(isWrap ? null : "sticky top-8", className)}
    >
      {isWrap ? null : (
        <p className="mb-3 px-2 font-medium text-foreground text-sm">Docs</p>
      )}
      <ul
        className={cn(isWrap ? "flex flex-wrap gap-1" : "flex flex-col gap-1")}
      >
        {DOCS_NAV.map((item) => {
          const isActive = pathname === item.href;

          return (
            <li key={item.href}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  buttonVariants({ size: "sm", variant: "ghost" }),
                  isWrap ? null : "w-full justify-start",
                  isActive && "bg-muted text-foreground"
                )}
                href={item.href}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
