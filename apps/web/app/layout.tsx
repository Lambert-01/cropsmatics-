import type { Metadata } from "next";
import { Suspense } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { LanguageProvider } from "@/lib/i18n";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Cropmatics Rwanda",
  description:
    "Crop Intelligence from Data to Action. An agricultural informatics and decision-intelligence platform for Cropmatics Rwanda.",
  icons: {
    icon: [
      { url: "/branding/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/branding/favicon-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: [{ url: "/branding/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

/**
 * Applies the stored colour scheme before the first paint.
 *
 * Without this the server always renders light, so a dark-mode user would see a
 * white flash until PreferencesProvider mounted. Reading localStorage + the OS
 * preference inline is the only way to avoid that flash; it fails safe to light.
 */
const THEME_BOOTSTRAP = `(function(){try{
  var raw = localStorage.getItem('cropmatics-preferences');
  var theme = raw ? (JSON.parse(raw) || {}).theme : 'system';
  var dark = theme === 'dark' || ((theme === 'system' || !theme) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <Providers>
          <PreferencesProvider>
            <LanguageProvider>
              <Suspense fallback={null}>
                <AppShell>{children}</AppShell>
              </Suspense>
            </LanguageProvider>
          </PreferencesProvider>
        </Providers>
      </body>
    </html>
  );
}
