export const SITE_LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/drafts", label: "My drafts" },
  { href: "/sponsors", label: "Sponsors" },
] as const;

export interface DocsNavItem {
  href: string;
  label: string;
}

export const DOCS_NAV: DocsNavItem[] = [
  { href: "/docs", label: "Introduction" },
  { href: "/docs/how-it-works", label: "How it works" },
  { href: "/docs/cli-setup", label: "CLI setup" },
  { href: "/docs/commands", label: "Commands" },
  { href: "/docs/envelope", label: "Envelope" },
];

export function isActivePath(pathname: string | null, href: string): boolean {
  if (pathname === null) {
    return false;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
