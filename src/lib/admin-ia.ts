// The whole back office, arranged as four departments.
//
// Before this, twenty-six destinations sat at the same level of importance in
// one long sidebar, which made every one of them feel equally urgent and none
// of them findable. The model now is:
//
//     Department  →  Tool  →  Tabs / filters inside the tool
//
// A thing earns a place in this file only if it is a TOOL — somewhere you go to
// work. Everything else is a tab, a filter, or a setting, and lives inside a
// tool rather than beside it. The mapping below is the whole point of the
// redesign, so it is written down once and read by the homepage cards, the
// sidebar rail, the department tab bar and the phone nav alike. Four
// navigations that disagree is how you end up back where we started.
//
// Note what this file does NOT do: it changes no routes. Every `to` below is a
// path that already existed. The departments are a layer of meaning over the
// existing app, not a rewrite of it — which is why nothing bookmarked breaks.
import {
  Palette, Shapes, Image as ImageIcon, Sparkles, Newspaper, FileImage,
  Package, FolderKanban, Shirt, Link2,
  ClipboardList, Printer, FileDown, Gauge,
  Users, Users2, Trophy, Building2, Star, CalendarDays, Share2, Coins,
  PenTool, ShoppingBag, PackageCheck, Boxes,
  type LucideIcon,
} from "lucide-react";

export type DepartmentKey = "creative" | "commerce" | "orders" | "people";

export interface Tool {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Named tabs or filters this tool contains — shown as its subtitle. */
  within?: string[];
}

export interface Department {
  key: DepartmentKey;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Where the card and the sidebar icon land. */
  home: string;
  tools: Tool[];
}

export const DEPARTMENTS: Department[] = [
  {
    key: "creative",
    label: "Creative",
    description: "Designs, templates, mockups, brand assets, and content.",
    icon: PenTool,
    home: "/admin/designs",
    tools: [
      { label: "Designs", to: "/admin/designs", icon: Palette },
      { label: "Design Templates", to: "/admin/design-templates", icon: Shapes },
      { label: "Mockups", to: "/admin/mockups", icon: ImageIcon },
      { label: "Brand Assets", to: "/admin/brand-assets", icon: Sparkles },
      { label: "Content", to: "/admin/content", icon: Newspaper },
      // The production PNG prompt is creative tooling, not a system setting —
      // it decides what every uploaded design becomes.
      { label: "Prompts", to: "/admin/prompts", icon: FileImage },
    ],
  },
  {
    key: "commerce",
    label: "Commerce",
    description: "Products, collections, blanks, and what everything sells for.",
    icon: ShoppingBag,
    home: "/admin/products",
    tools: [
      { label: "Products", to: "/admin/products", icon: Package },
      { label: "Collections", to: "/admin/collections", icon: FolderKanban },
      // Blanks already swallowed photography and pricing as views of itself.
      { label: "Blanks", to: "/admin/blanks", icon: Shirt, within: ["Catalog", "Assortments", "Pricing", "Photos"] },
      // Inventory is its own tool: it answers "what do we have", which is a
      // different question from "what do we offer" and comes from Shopify.
      { label: "Inventory", to: "/admin/blanks/inventory", icon: Boxes, within: ["Available", "Sold Out", "Not Linked", "Hidden"] },
      { label: "Quote Links", to: "/admin/pricing-links", icon: Link2 },
    ],
  },
  {
    key: "orders",
    label: "Orders",
    description: "Take an order from placed to delivered, in one place.",
    icon: PackageCheck,
    home: "/admin/orders",
    tools: [
      // One order list with status filters, rather than a page per status.
      {
        label: "All Orders",
        to: "/admin/orders",
        icon: ClipboardList,
        within: ["Pending", "Processing", "Ready to ship", "Shipped", "Returns"],
      },
      { label: "Print Queue", to: "/admin/print-queue", icon: Printer },
      { label: "Imports", to: "/admin/imports/orders", icon: FileDown },
      // Fulfilment, print geometry and the ingestion feed are all things you
      // configure or watch rather than work through daily.
      { label: "Operations", to: "/admin/pulse", icon: Gauge, within: ["Pulse", "Fulfillment", "Print Zones", "Ingestion"] },
    ],
  },
  {
    key: "people",
    label: "People",
    description: "Athletes, teams, organizations, and how they get access.",
    icon: Users2,
    home: "/admin/athletes",
    tools: [
      { label: "Athletes", to: "/admin/athletes", icon: Users },
      { label: "Teams", to: "/admin/teams", icon: Trophy },
      { label: "Organizations", to: "/admin/organizations", icon: Building2 },
      { label: "Memberships", to: "/admin/access", icon: Star },
      { label: "Camps & Events", to: "/admin/events", icon: CalendarDays },
      { label: "Affiliates", to: "/admin/affiliates", icon: Share2 },
      { label: "Credits", to: "/admin/credits", icon: Coins },
    ],
  },
];

/**
 * Destinations that belong to a department without being one of its tabs.
 *
 * A detail page is the clearest case: /admin/athletes/:id is People, but it
 * should not appear in the tab strip as a sibling of the list it came from.
 * Operations tools are the other case — grouped behind one tab, but each still
 * needs to light that tab up when you are on it.
 */
const ALSO: Record<DepartmentKey, string[]> = {
  creative: ["/admin/templates"],
  // /admin/pricing redirects into the Blanks pricing view, but the redirect
  // still renders one frame at the old path — long enough for the chrome to
  // flash "no department" if it isn't claimed here.
  commerce: ["/admin/pricing"],
  orders: ["/admin/fulfillment", "/admin/print-zones", "/admin/ingestion"],
  people: [],
};

/** Which tab an ALSO path should light up, when it isn't a tool itself. */
const STANDS_FOR: Record<string, string> = {
  "/admin/fulfillment": "/admin/pulse",
  "/admin/print-zones": "/admin/pulse",
  "/admin/ingestion": "/admin/pulse",
  "/admin/templates": "/admin/prompts",
  "/admin/pricing": "/admin/blanks",
};

/**
 * Is this destination the one currently open?
 *
 * The boundary check matters: a plain startsWith made /admin/pricing-links
 * light up "Pricing" as well as "Pricing Links", because one path is a string
 * prefix of the other. Only a full path segment counts.
 */
export function isItemActive(to: string, pathname: string, end?: boolean): boolean {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Every path a department owns, tools and satellites alike. */
function pathsOf(d: Department): string[] {
  return [...d.tools.map((t) => t.to), ...ALSO[d.key]];
}

/**
 * Which department the current page belongs to.
 *
 * Longest match wins, so /admin/design-templates resolves to Design Templates
 * rather than to Designs, whose path is not a segment prefix of it anyway but
 * would be under a sloppier test.
 */
export function departmentFor(pathname: string): Department | null {
  let best: { d: Department; len: number } | null = null;
  for (const d of DEPARTMENTS) {
    for (const p of pathsOf(d)) {
      if (isItemActive(p, pathname) && (!best || p.length > best.len)) {
        best = { d, len: p.length };
      }
    }
  }
  return best?.d ?? null;
}

/** Which tool tab should read as current — including via a satellite path. */
export function activeToolFor(pathname: string): Tool | null {
  const d = departmentFor(pathname);
  if (!d) return null;

  let best: { tool: Tool; len: number } | null = null;
  for (const tool of d.tools) {
    if (isItemActive(tool.to, pathname) && (!best || tool.to.length > best.len)) {
      best = { tool, len: tool.to.length };
    }
  }
  if (best) return best.tool;

  // A satellite page: light up the tab that stands for it.
  for (const p of ALSO[d.key]) {
    if (isItemActive(p, pathname)) {
      const stand = STANDS_FOR[p];
      return d.tools.find((t) => t.to === stand) ?? null;
    }
  }
  return null;
}

export function departmentByKey(key: string): Department | null {
  return DEPARTMENTS.find((d) => d.key === key) ?? null;
}

/** How many tools a department card should advertise. */
export function toolCount(d: Department): number {
  return d.tools.length;
}

/** Every tool across every department — for search and coverage checks. */
export function allTools(): Tool[] {
  return DEPARTMENTS.flatMap((d) => d.tools);
}
