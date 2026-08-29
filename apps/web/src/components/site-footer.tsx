import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto w-full px-4 py-8 sm:px-6">
      <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-muted-foreground text-sm">
        <span>© {new Date().getFullYear()} BitPlan</span>
        <Link className="hover:text-foreground" href="/about">
          About
        </Link>
        <Link className="hover:text-foreground" href="/privacy">
          Privacy
        </Link>
        <Link className="hover:text-foreground" href="/contact">
          Contact
        </Link>
      </p>
    </footer>
  );
}
