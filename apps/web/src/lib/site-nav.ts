export const SITE_LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/drafts", label: "My drafts" },
  { href: "/sponsors", label: "Sponsors" },
] as const;

export interface DocsNavItem {
  href: string;
  label: string;
}

export const DOCS_NAV: { items: DocsNavItem[]; label: string }[] = [
  {
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/how-it-works", label: "How it works" },
      { href: "/docs/cli-setup", label: "CLI setup" },
    ],
    label: "Get started",
  },
  {
    items: [
      { href: "/docs/commands", label: "Commands" },
      { href: "/docs/envelope", label: "Envelope" },
    ],
    label: "Reference",
  },
];
