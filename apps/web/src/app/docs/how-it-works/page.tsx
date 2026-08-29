import { FileLock2, KeyRound, Upload, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";

export const metadata: Metadata = {
  description:
    "Encrypt an HTML plan to your wallet, inscribe it on Bitcoin, and read it in the viewer.",
  title: "How it works",
};

const BEATS = [
  {
    description:
      "npx bitplan upload ./plan.html checks the HTML, scans for secrets, encrypts to your wallet, and inscribes the file.",
    icon: Upload,
    title: "Publish",
  },
  {
    description:
      "Open the viewer link and connect the same wallet. The draft decrypts in the browser. bitplan.dev never sees the plaintext.",
    icon: FileLock2,
    title: "Read",
  },
  {
    description:
      "The first upload creates the coin. Later uploads of the same file become new versions of that coin. One origin, a history.",
    icon: KeyRound,
    title: "Versions",
  },
  {
    description:
      "There is no API key. If the wallet holds the satoshi, it can publish the next version and decrypt the old ones.",
    icon: Wallet,
    title: "Wallet",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <h1>How it works</h1>
      <p>
        BitPlan puts an HTML plan on Bitcoin as a 1Sat Ordinal, encrypted to
        your wallet. This site is the viewer. It stores nothing.
      </p>
      <div className="not-typeset mt-6">
        <ItemGroup>
          {BEATS.map((beat) => (
            <Item key={beat.title} variant="outline">
              <ItemMedia variant="icon">
                <beat.icon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{beat.title}</ItemTitle>
                <ItemDescription>{beat.description}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </div>
      <div className="not-typeset mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/docs/cli-setup">CLI setup</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/drafts">My drafts</Link>
        </Button>
      </div>
    </>
  );
}
