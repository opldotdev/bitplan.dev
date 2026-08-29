export function SiteFooter() {
  return (
    <footer className="mt-auto w-full px-6 py-8">
      <p className="text-center text-muted-foreground text-sm">
        © {new Date().getFullYear()} BitPlan
      </p>
    </footer>
  );
}
