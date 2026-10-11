/**
 * The header menu ("More"), as data.
 *
 * Every screen that used to sit behind the More *tab* is listed here, so that
 * moving More out of the tab bar can be checked rather than assumed: when `More`
 * is no longer a destination, nothing it held may become unreachable.
 *
 * Kept free of React Native and i18n imports so the reachability test can assert
 * it in a plain node environment. `label` is a strings key, resolved by the
 * screen.
 */

export interface MenuItem {
  /** A key of `src/i18n` `Strings`. */
  label: string;
  href: string;
  /** An Ionicons glyph name. */
  icon: string;
}

export interface MenuGroup {
  /** A key of `src/i18n` `Strings`. */
  title: string;
  items: MenuItem[];
}

export const MENU_GROUPS: MenuGroup[] = [
  {
    title: "moreGroupExploreData",
    items: [
      { label: "explore", href: "/explore", icon: "compass-outline" },
      { label: "askCropmatics", href: "/ask", icon: "chatbubble-ellipses-outline" },
    ],
  },
  {
    title: "moreGroupMyInformation",
    items: [
      { label: "savedItems", href: "/saved", icon: "bookmark-outline" },
      { label: "askHistory", href: "/ask/history", icon: "time-outline" },
      { label: "myInquiries", href: "/inquiry/history", icon: "document-text-outline" },
      { label: "inquiryTitle", href: "/inquiry/new", icon: "mail-outline" },
    ],
  },
  {
    title: "moreGroupCropmatics",
    items: [
      { label: "dataSources", href: "/more/data-sources", icon: "shield-checkmark-outline" },
      { label: "methodologyTitle", href: "/more/methodology", icon: "flask-outline" },
      { label: "settings", href: "/more/settings", icon: "settings-outline" },
      { label: "help", href: "/more/help", icon: "help-circle-outline" },
    ],
  },
  {
    title: "moreGroupAbout",
    items: [
      { label: "aboutCropmatics", href: "/more/about", icon: "information-circle-outline" },
      { label: "privacy", href: "/more/privacy", icon: "lock-closed-outline" },
    ],
  },
];

export const FIELD_OPERATIONS_ITEM: MenuItem = {
  label: "moreFieldOperations",
  href: "/field-operations",
  icon: "leaf-outline",
};

/** The first path segment of an href, e.g. `/more/help` -> `more`. */
export function menuRoot(href: string): string {
  return href.replace(/^\//, "").split("/")[0] ?? "";
}
