"use client";

import { Check, Share2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buildReaderLinkInstructions } from "@/lib/sharing";

export function HostedShareDialog({ origin }: { origin: string }) {
  const [copied, setCopied] = useState(false);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setCopied(false);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildReaderLinkInstructions(origin));
      setCopied(true);
      toast.success("Reader-link instructions copied");
    } catch {
      setCopied(false);
      toast.error("Could not copy reader-link instructions");
    }
  }, [origin]);

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="ghost">
          <Share2 data-icon="inline-start" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a reader link</DialogTitle>
          <DialogDescription>
            This browser opened the plan with your wallet, so it has no reader
            link to copy. The computer that published the plan can add one to a
            new version. Anyone with the complete link will be able to read it.
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          Copy these instructions to the agent working with the plan's local
          source file. You do not need to collect public keys.
        </p>
        <DialogFooter showCloseButton>
          <Button onClick={handleCopy} type="button">
            {copied ? (
              <Check data-icon="inline-start" />
            ) : (
              <Share2 data-icon="inline-start" />
            )}
            {copied ? "Copied" : "Copy agent instructions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
