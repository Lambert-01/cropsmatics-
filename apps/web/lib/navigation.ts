import {
  Bot,
  FileText,
  LayoutDashboard,
  Map,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Sprout,
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
  /**
   * Capability a destination needs before it is offered in the navigation.
   *
   * There is deliberately no "coming soon" flag: a destination is either backed
   * by data the platform can serve, or it is not in the navigation at all.
   * `market_prices` is the only capability today — Market Intelligence stays
   * hidden until verified price observations are actually loaded.
   */
  capability?: "market_prices";
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
      { href: "/crops", label: "Crops", icon: Sprout },
      { href: "/productivity", label: "Productivity", icon: TrendingUp },
      { href: "/yield-intelligence", label: "Yield Intelligence", icon: Wheat },
      { href: "/interventions", label: "Interventions", icon: Wrench },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/post-harvest", label: "Post-Harvest", icon: Package },
      { href: "/storage", label: "Storage & Aggregation", icon: Warehouse },
      { href: "/markets", label: "Markets", icon: ShoppingBasket, capability: "market_prices" },
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
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/install", label: "Get the app", icon: Smartphone },
    ],
  },
];

export const FOOTER_TAGLINE = ["Smarter Data", "Stronger Harvests", "A Resilient Rwanda"];
