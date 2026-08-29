"use client";

import { Check, Share2 } from "lucide-react";
import { type ChangeEvent, useCallback, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { buildShareInstructions, parseIdentityKeys } from "@/lib/sharing";

export function ShareDraftDialog({ origin }: { origin: string }) {
  const [identityKeys, setIdentityKeys] = useState("");
  const [copied, setCopied] = useState(false);
  const parsed = parseIdentityKeys(identityKeys);
  const canCopy = parsed.valid.length > 0 && parsed.invalid.length === 0;
  const instructions = canCopy
    ? buildShareInstructions(origin, parsed.valid)
    : null;

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setCopied(false);
    }
  }, []);

  const handleIdentityKeysChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setIdentityKeys(event.target.value);
      setCopied(false);
    },
    []
  );

  const handleCopy = useCallback(async () => {
    if (!instructions) {
      return;
    }
    try {
      await navigator.clipboard.writeText(instructions);
      setCopied(true);
      toast.success("Sharing instructions copied");
    } catch {
      setCopied(false);
      toast.error("Could not copy sharing instructions");
    }
  }, [instructions]);

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
          <DialogTitle>Share the next version</DialogTitle>
          <DialogDescription>
            Add wallet identity public keys, then copy instructions for the
            publishing agent. The keys and access list will be public.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor="share-identity-keys">
            Identity keys
          </label>
          <Textarea
            aria-describedby="share-identity-keys-help"
            aria-invalid={parsed.invalid.length > 0}
            id="share-identity-keys"
            onChange={handleIdentityKeysChange}
            placeholder="One compressed public key per line (02… or 03…)"
            rows={4}
            spellCheck={false}
            value={identityKeys}
          />
          {parsed.invalid.length > 0 ? (
            <p
              className="text-destructive text-xs"
              id="share-identity-keys-help"
              role="alert"
            >
              Invalid identity {parsed.invalid.length === 1 ? "key" : "keys"}:{" "}
              {parsed.invalid.join(", ")}
            </p>
          ) : (
            <p
              className="text-muted-foreground text-xs"
              id="share-identity-keys-help"
            >
              Sharing publishes a new version. It cannot change access to older
              versions.
            </p>
          )}
        </div>
        <DialogFooter showCloseButton>
          <Button disabled={!canCopy} onClick={handleCopy} type="button">
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
