"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { DraftsList } from "@/components/drafts-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function PlanSwitcher({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <>
      <Button
        aria-haspopup="dialog"
        aria-label={`Switch document: ${title}`}
        className="mx-auto min-w-0 max-w-full gap-1 px-1 font-serif sm:px-3 lg:absolute lg:left-1/2 lg:max-w-[30vw] lg:-translate-x-1/2"
        onClick={() => setOpen(true)}
        variant="ghost"
      >
        <span className="truncate">{title}</span>
        <ChevronDown className="size-3 shrink-0" />
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto p-6 sm:max-w-2xl sm:p-8"
          fullScreenOnMobile={false}
        >
          <DialogTitle className="font-serif text-3xl">Your plans</DialogTitle>
          <DialogDescription className="sr-only">
            Search plans available to your connected wallet, or rename the
            current plan.
          </DialogDescription>
          <Input
            aria-label="Find a plan"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a plan…"
            value={query}
          />
          <div className="min-h-0">
            <DraftsList query={query} />
          </div>
          <div className="border-t pt-4">
            <p className="mb-1 text-muted-foreground text-xs">
              Current plan · click to rename
            </p>
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
