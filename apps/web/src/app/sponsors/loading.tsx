import { Skeleton } from "@/components/ui/skeleton";

export default function SponsorsLoading() {
  return (
    <main className="flex-1 overflow-x-clip bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
        <Skeleton className="size-12 rounded-sm" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-16 w-full max-w-xl" />
        <Skeleton className="mt-8 h-40 w-full" />
      </div>
    </main>
  );
}
