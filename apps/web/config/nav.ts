import {
  History,
  Home,
  Library,
  Search,
  Star,
  Store,
  User2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

import { asRoute } from "~/lib/utils";

export type NavItem = {
  title: string;
  href: Route;
  icon: LucideIcon;
};

/** The primary screen set. The old browse routes keep their pages off the nav. */
export const primaryNav: NavItem[] = [
  { title: "Home", href: "/", icon: Home },
  { title: "Search", href: "/search", icon: Search },
  { title: "Library", href: asRoute("/library"), icon: Library },
  { title: "Market", href: "/market", icon: Store },
  { title: "You", href: "/me", icon: User2 },
];

export const libraryNav: NavItem[] = [
  {
    title: "Recently Played",
    href: "/me/recently-played",
    icon: History,
  },
  {
    title: "Your Favorite",
    href: "/me/liked-songs",
    icon: Star,
  },
];

/** The mockup tab bar rule: exact match, or a path below the item. `/` only matches itself. */
export function isNavActive(pathname: string | null, href: string) {
  if (pathname === null) return false;
  if (href === "/") return pathname === "/";

  return pathname === href || pathname.startsWith(`${href}/`);
}
