import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Cropmatics Rwanda",
  description:
    "Crop Intelligence from Data to Action. An agricultural informatics and decision-intelligence platform for Cropmatics Rwanda.",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/productivity", label: "Productivity" },
  { href: "/interventions", label: "Interventions" },
  { href: "/storage", label: "Storage" },
  { href: "/transparency", label: "Transparency" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="border-b border-slate-200 bg-white">
            <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
              <div className="flex flex-col">
                <span className="font-semibold uppercase tracking-wide text-brand-forest">
                  CROPMATICS
                </span>
                <span className="text-xs text-slate-500">Rwanda Agricultural Intelligence</span>
              </div>
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-sm text-slate-600">
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-slate-500">
            Official statistics and voluntary app data are kept separate. Analyses
            describe associations and priorities for investigation, not proven causes.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
