import {
  Bot,
  FileText,
  LayoutDashboard,
  Map,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  Table2,
  TrendingUp,
  Warehouse,
  Wheat,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Marks routes that render a professional "coming in next module" screen. */
  comingSoon?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Intelligence",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/productivity", label: "Productivity", icon: TrendingUp },
      { href: "/yield-intelligence", label: "Yield Intelligence", icon: Wheat, comingSoon: true },
      { href: "/interventions", label: "Interventions", icon: Wrench },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/post-harvest", label: "Post-Harvest", icon: Package },
      { href: "/storage", label: "Storage & Aggregation", icon: Warehouse },
      { href: "/markets", label: "Markets", icon: ShoppingBasket, comingSoon: true },
    ],
  },
  {
    label: "Geography & data",
    items: [
      { href: "/maps", label: "Maps", icon: Map },
      { href: "/reports", label: "Reports", icon: FileText },
      { href: "/data-explorer", label: "Data Explorer", icon: Table2 },
      { href: "/transparency", label: "Data & Models", icon: ShieldCheck },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/assistant", label: "AI Assistant", icon: Bot },
      { href: "/settings", label: "Settings", icon: Settings, comingSoon: true },
    ],
  },
];

export const FOOTER_TAGLINE = ["Smarter Data", "Stronger Harvests", "A Resilient Rwanda"];
