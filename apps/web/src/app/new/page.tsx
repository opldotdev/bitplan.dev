import type { Metadata } from "next";

import { PlanComposer } from "@/components/plan-composer";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "New plan",
};

export default function NewPlanPage() {
  return (
    <main className="mx-auto w-full max-w-[42rem] flex-1 px-6 py-10">
      <PlanComposer />
    </main>
  );
}
