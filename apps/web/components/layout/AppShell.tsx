"use client";

import { useState } from "react";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <AppSidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:pl-64">
        <DashboardHeader onOpenNav={() => setNavOpen(true)} />
        <main className="mx-auto max-w-[1600px] px-3 py-4 sm:px-5 sm:py-6">{children}</main>
        <footer className="mx-auto max-w-[1600px] px-4 pb-8 text-[11px] text-slate-500">
          Official NISR/MINAGRI statistics and voluntary app data are kept separate. Analyses
          describe associations and priorities for investigation, not proven causes.
        </footer>
      </div>
    </div>
  );
}
