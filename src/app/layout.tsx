import type { Metadata } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

import "./globals.css";

/**
 * Pre-hydration cleanup: strips `data-cursor-ref` attributes that the Cursor
 * IDE browser preview / `cursor-ide-browser` MCP injects into the live DOM
 * for element-tracking. Those attributes are not present in the SSR HTML, so
 * without this script React fires a hydration mismatch warning in dev. In a
 * regular browser (Chrome/Safari) the attributes never appear, so this script
 * is a no-op in production. The MutationObserver handles the case where the
 * tooling injects attributes after the initial DOM parse.
 */
const stripCursorRefsScript = `
(function () {
  try {
    var ATTR = 'data-cursor-ref';
    function strip() {
      var els = document.querySelectorAll('[' + ATTR + ']');
      for (var i = 0; i < els.length; i++) els[i].removeAttribute(ATTR);
    }
    strip();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(strip).observe(document.documentElement || document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [ATTR],
      });
    }
  } catch (_) {}
})();
`;

export const metadata: Metadata = {
  title: "PaperPilot AI — Behavior audits for AI trading agents",
  description:
    "PaperPilot AI grades whether your AI trading agent obeys the rules it claims to follow. Deterministic bot scoring, explicit violation codes, and a persistent paper-trading audit log. No live execution, ever.",
  metadataBase: new URL("https://paperpilot.ai"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="strip-cursor-refs"
          strategy="beforeInteractive"
        >
          {stripCursorRefsScript}
        </Script>
      </head>
      <body
        className={cn(
          GeistSans.variable,
          GeistMono.variable,
          "min-h-screen bg-background font-sans text-foreground antialiased",
        )}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
