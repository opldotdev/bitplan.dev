import type { Metadata } from "next";

import { DraftsList } from "@/components/drafts-list";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "My drafts — BitPlan",
};

export default function DraftsPage() {
  return (
    <main className="mx-auto w-full max-w-[42rem] flex-1 px-6 py-10">
      <h1 className="mb-8 font-semibold text-2xl tracking-tight">My drafts</h1>
      <DraftsList />
    </main>
  );
}
