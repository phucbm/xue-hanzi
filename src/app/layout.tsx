import type {Metadata, Viewport} from "next";
import {SwAutoUpdate} from "@/components/SwAutoUpdate";
import {PWATracker} from "@/components/PWATracker";
import {Toaster} from "@/components/ui/sonner";
import {ThemeProvider} from "@/components/theme-provider";
import pkg from "../../package.json";
import "./fonts.css";
import "./globals.css";

/**
 * Fonts: Noto Serif (body text, Vietnamese/Latin) and Noto Serif SC (Chinese) are self-hosted in public/fonts/, with
 * the @font-face rules in ./fonts.css (scripts/fetch-fonts.mjs). Not next/font/google: its build-time fetch failed on
 * Vercel's builders. globals.css names the families (--font-noto-serif, --font-noto-serif-sc).
 */

export const metadata: Metadata = {
    applicationName: pkg.title,
    title: `${pkg.title} v${pkg.version} — Từ điển Hán Việt`,
    description: pkg.description,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
      title: pkg.title,
  },
  icons: {
    icon: "/icon.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5EFE4" },
    { media: "(prefers-color-scheme: dark)", color: "#2A201A" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-serif">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SwAutoUpdate />
          <PWATracker />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
