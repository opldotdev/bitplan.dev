import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { CommandMenu } from "@/components/command-menu";
import { SiteChrome } from "@/components/site-chrome";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

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
  description:
    "Encrypt an HTML plan to your wallet and inscribe it on Bitcoin. bitplan.dev is the viewer.",
  metadataBase: new URL("https://bitplan.dev"),
  title: {
    default: "BitPlan",
    template: "%s · BitPlan",
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
        <ThemeProvider>
          <TooltipProvider>
            <SiteChrome>{children}</SiteChrome>
            <CommandMenu />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
