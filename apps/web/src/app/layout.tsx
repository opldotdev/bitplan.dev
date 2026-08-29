import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SiteChrome } from "@/components/site-chrome";
import { SiteJsonLd } from "@/components/site-json-ld";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE_URL } from "@/lib/site";

import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  alternates: {
    canonical: "./",
    types: {
      "text/markdown": "./",
    },
  },
  description:
    "Publish encrypted HTML plans through a BRC-100 wallet on Bitcoin. bitplan.dev is the viewer.",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    locale: "en_US",
    siteName: "BitPlan",
    type: "website",
  },
  title: {
    default: "BitPlan",
    template: "%s · BitPlan",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      lang="en"
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col">
        <SiteJsonLd />
        <ThemeProvider>
          <TooltipProvider>
            <SiteChrome>{children}</SiteChrome>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
