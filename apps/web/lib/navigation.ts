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
  /**
   * Dictionary key for the visible label, e.g. ``nav.overview``.
   *
   * Explicit rather than derived from the href: the two are not the same word.
   * ``/dashboard`` is labelled "Overview", so deriving the key would ask the
   * dictionary for a ``nav.dashboard`` entry that does not exist and render the
   * raw key instead of a label.
   */
  labelKey: string;
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
      { href: "/dashboard", label: "Overview", labelKey: "nav.overview", icon: LayoutDashboard },
      { href: "/crops", label: "Crops", labelKey: "nav.crops", icon: Sprout },
      { href: "/productivity", label: "Productivity", labelKey: "nav.productivity", icon: TrendingUp },
      {
        href: "/yield-intelligence",
        label: "Yield Intelligence",
        labelKey: "nav.yield-intelligence",
        icon: Wheat,
      },
      { href: "/interventions", label: "Interventions", labelKey: "nav.interventions", icon: Wrench },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/post-harvest", label: "Post-Harvest", labelKey: "nav.post-harvest", icon: Package },
      {
        href: "/storage",
        label: "Storage & Aggregation",
        labelKey: "nav.storage",
        icon: Warehouse,
      },
      {
        href: "/markets",
        label: "Markets",
        labelKey: "nav.markets",
        icon: ShoppingBasket,
        capability: "market_prices",
      },
    ],
  },
  {
    label: "Geography & data",
    items: [
      { href: "/maps", label: "Maps", labelKey: "nav.maps", icon: Map },
      { href: "/reports", label: "Reports", labelKey: "nav.reports", icon: FileText },
      {
        href: "/data-explorer",
        label: "Data Explorer",
        labelKey: "nav.data-explorer",
        icon: Table2,
      },
      {
        href: "/transparency",
        label: "Data & Models",
        labelKey: "nav.transparency",
        icon: ShieldCheck,
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/assistant", label: "AI Assistant", labelKey: "nav.assistant", icon: Bot },
      { href: "/settings", label: "Settings", labelKey: "nav.settings", icon: Settings },
      { href: "/install", label: "Get the app", labelKey: "nav.install", icon: Smartphone },
    ],
  },
];

export const FOOTER_TAGLINE = ["Smarter Data", "Stronger Harvests", "A Resilient Rwanda"];
