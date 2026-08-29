"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
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
    <SidebarProvider
      className={cn("min-h-0", isWrap ? null : "sticky top-8", className)}
      style={
        {
          "--sidebar-width": isWrap ? "100%" : "11rem",
        } as CSSProperties
      }
    >
      <Sidebar
        aria-label="Documentation"
        className="h-fit w-full rounded-lg border"
        collapsible="none"
      >
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Docs</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {DOCS_NAV.map((item) => {
                  const isActive = pathname === item.href;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link
                          aria-current={isActive ? "page" : undefined}
                          href={item.href}
                        >
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}
