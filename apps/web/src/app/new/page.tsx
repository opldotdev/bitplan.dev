import type { Metadata } from "next";

import { PlanComposer } from "@/components/plan-composer";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "New shared draft",
};

export default function NewPlanPage() {
  return (
    <main className="w-full flex-1">
      <PlanComposer />
    </main>
  );
}
