"use client";

import { PanelLeftIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { DocsNav } from "@/components/docs-nav";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

export function DocsShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <SidebarProvider className="min-h-0 flex-1 items-stretch">
      <Sidebar className="hidden border-r md:flex" collapsible="none">
        <SidebarHeader className="px-4 py-3 font-medium text-sm">
          Docs
        </SidebarHeader>
        <SidebarContent>
          <ScrollArea className="h-full">
            <DocsNav />
          </ScrollArea>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <div className="border-b px-4 py-2 md:hidden">
          <Sheet onOpenChange={setMobileOpen} open={mobileOpen}>
            <SheetTrigger asChild>
              <Button size="sm" type="button" variant="outline">
                <PanelLeftIcon data-icon="inline-start" />
                Docs menu
              </Button>
            </SheetTrigger>
            <SheetContent className="w-72 p-0" side="left">
              <SheetHeader className="px-4 py-3">
                <SheetTitle>Docs</SheetTitle>
              </SheetHeader>
              <DocsNav onNavigate={closeMobile} />
            </SheetContent>
          </Sheet>
        </div>
        <div className="mx-auto w-full max-w-3xl px-6 py-10">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
