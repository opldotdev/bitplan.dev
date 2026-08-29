export function SiteFooter() {
  return (
    <footer className="mt-auto w-full px-4 py-8 sm:px-6">
      <p className="text-center text-muted-foreground text-sm">
        © {new Date().getFullYear()} BitPlan
      </p>
    </footer>
  );
}
