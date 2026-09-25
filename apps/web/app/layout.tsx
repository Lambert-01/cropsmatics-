import type { Metadata } from "next";
import { Suspense } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { LanguageProvider } from "@/lib/i18n";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Cropmatics Rwanda",
  description:
    "Crop Intelligence from Data to Action. An agricultural informatics and decision-intelligence platform for Cropmatics Rwanda.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <LanguageProvider>
            <Suspense fallback={null}>
              <AppShell>{children}</AppShell>
            </Suspense>
          </LanguageProvider>
        </Providers>
      </body>
    </html>
  );
}
