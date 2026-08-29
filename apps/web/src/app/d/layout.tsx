import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Encrypted draft",
};

export default function DraftLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
