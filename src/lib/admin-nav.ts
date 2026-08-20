// One definition of the admin navigation, shared by the sidebar, the phone
// bottom nav and anything else that needs to know where things live.
//
// Two shapes deliberately:
//
//   PINNED  — the handful you open every day. No header, never collapses,
//             always one click away.
//   GROUPS  — everything else, folded up until you need it. Before this, all
//             twenty-four destinations were expanded at once, which is a wall
//             of text rather than a menu.
//
// Grouping rule: a group earns its header by holding roughly five or more
// things. Single-item groups ("Access", "Events") cost more space in headers
// than they save in structure, so those items moved into the group they
// actually belong with.
import {
  Home, Inbox, ListChecks, BarChart3,
  Palette, Shapes, Image as ImageIcon, Sparkles, Newspaper,
  Package, FolderKanban, Shirt, DollarSign, Link2, ImagePlus,
  Gauge, ClipboardList, Truck, Printer, Ruler, FileDown, Download,
  Users, Trophy, Building2, Star, CalendarDays, Share2, Coins,
  FileQuestion, FileImage, LayoutTemplate, UserCog, Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Home routes only — otherwise every child path would light it up. */
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const PINNED: NavItem[] = [
  { label: "Overview", to: "/admin", icon: Home, end: true },
  { label: "Inbox", to: "/admin/inbox", icon: Inbox },
  { label: "Tasks", to: "/admin/tasks", icon: ListChecks },
  { label: "Analytics", to: "/admin/analytics", icon: BarChart3 },
];

export const GROUPS: NavGroup[] = [
  {
    label: "Creative",
    items: [
      { label: "Designs", to: "/admin/designs", icon: Palette },
      { label: "Design Templates", to: "/admin/design-templates", icon: Shapes },
      { label: "Mockups", to: "/admin/mockups", icon: ImageIcon },
      { label: "Brand Assets", to: "/admin/brand-assets", icon: Sparkles },
      { label: "Content", to: "/admin/content", icon: Newspaper },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Products", to: "/admin/products", icon: Package },
      { label: "Collections", to: "/admin/collections", icon: FolderKanban },
      // Blanks, blank photography and pricing were three entries describing the
      // same records. They are now views inside one destination, reachable at
      // /admin/blanks?view=… — so the sidebar names the thing, not the screen.
      { label: "Blanks", to: "/admin/blanks", icon: Shirt },
      { label: "Print Zones", to: "/admin/print-zones", icon: Ruler },
      { label: "Pricing Links", to: "/admin/pricing-links", icon: Link2 },
    ],
  },
  {
    label: "Orders",
    items: [
      { label: "Pulse", to: "/admin/pulse", icon: Gauge },
      { label: "Orders", to: "/admin/orders", icon: ClipboardList },
      { label: "Fulfillment", to: "/admin/fulfillment", icon: Truck },
      { label: "Print Queue", to: "/admin/print-queue", icon: Printer },
      { label: "Order Imports", to: "/admin/imports/orders", icon: FileDown },
      { label: "Ingestion", to: "/admin/ingestion", icon: Download },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Athletes", to: "/admin/athletes", icon: Users },
      { label: "Teams", to: "/admin/teams", icon: Trophy },
      { label: "Organizations", to: "/admin/organizations", icon: Building2 },
      { label: "Memberships", to: "/admin/access", icon: Star },
      { label: "Camps & Events", to: "/admin/events", icon: CalendarDays },
      { label: "Affiliates", to: "/admin/affiliates", icon: Share2 },
      { label: "Credits", to: "/admin/credits", icon: Coins },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Questionnaires", to: "/admin/questionnaires", icon: FileQuestion },
      { label: "Prompts", to: "/admin/prompts", icon: FileImage },
      { label: "Templates", to: "/admin/templates", icon: LayoutTemplate },
      { label: "Team", to: "/admin/users", icon: UserCog },
      { label: "Settings", to: "/admin/settings", icon: Settings },
    ],
  },
];

/**
 * Is this destination the one currently open?
 *
 * The boundary check matters: a plain startsWith made /admin/pricing-links
 * light up "Pricing" as well as "Pricing Links", because one path is a string
 * prefix of the other. Only a full segment counts.
 */
export function isItemActive(to: string, pathname: string, end?: boolean): boolean {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Which group holds the current route — used to open exactly that one on a
 * first visit, and to mark a collapsed group as containing where you are.
 * Longest match wins so a nested path resolves to the more specific item.
 */
export function activeGroupFor(pathname: string): string | null {
  let best: { label: string; length: number } | null = null;
  for (const group of GROUPS) {
    for (const item of group.items) {
      if (isItemActive(item.to, pathname, item.end) && (!best || item.to.length > best.length)) {
        best = { label: group.label, length: item.to.length };
      }
    }
  }
  return best?.label ?? null;
}

/** Every destination, flattened — for search and for coverage checks. */
export function allNavItems(): NavItem[] {
  return [...PINNED, ...GROUPS.flatMap((g) => g.items)];
}
