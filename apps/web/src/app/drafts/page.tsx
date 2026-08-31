import type { Metadata } from "next";
import Link from "next/link";

import { DraftsList } from "@/components/drafts-list";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "My drafts",
};

export default function DraftsPage() {
  return (
    <main className="mx-auto w-full max-w-[42rem] flex-1 px-6 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl tracking-tight">My drafts</h1>
        <Button asChild size="sm">
          <Link href="/new">New plan</Link>
        </Button>
      </div>
      <DraftsList />
    </main>
  );
}
