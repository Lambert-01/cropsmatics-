"use client";

import { Leaf, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { useLanguage } from "@/lib/i18n";
import { FOOTER_TAGLINE, NAV_GROUPS } from "@/lib/navigation";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/" || pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <div className="flex h-full flex-col bg-forest-deep text-white/90">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-primary ring-1 ring-white/15">
          <Leaf className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Cropmatics Rwanda</p>
          <p className="text-[11px] text-white/60">Crop Intelligence from Data to Action</p>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Primary" className="thin-scroll flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              {t(`group.${group.label}`)}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
                        active
                          ? "bg-white/12 font-medium text-white ring-1 ring-inset ring-white/10"
                          : "text-white/70 hover:bg-white/[0.07] hover:text-white",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          active ? "text-primary" : "text-white/50 group-hover:text-white/80",
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate">{t(`nav.${item.href.replace(/^\//, "")}`)}</span>
                      {item.comingSoon ? (
                        <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/50">
                          Soon
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Landscape footer */}
      <div className="sidebar-landscape mt-auto px-5 py-5">
        <p className="text-[11px] font-medium leading-relaxed text-white/85">
          {FOOTER_TAGLINE.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
        <p className="mt-2 text-[10px] text-white/45">
          Official NISR/MINAGRI statistics · associations, not causation
        </p>
      </div>
    </div>
  );
}

export function AppSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-forest-deep/50 transition-opacity",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cn(
            "absolute inset-y-0 left-0 w-64 max-w-[80%] shadow-pop transition-transform",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-white/70 hover:bg-white/10"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
          <SidebarContent onNavigate={onClose} />
        </div>
      </div>
    </>
  );
}
