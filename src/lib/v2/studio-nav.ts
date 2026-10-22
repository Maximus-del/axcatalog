// AX Studio OS — the seven sections of /admin-v2 and which one owns an address.
//
// The prototype's navigation (Today / Projects & Tasks / Client Spaces /
// Creative Studio / Asset Library / Releases / Business) is laid over the
// routes V2 already had. Nothing was renamed or moved out from under an
// existing link: `/admin-v2/commerce`, `/orders`, `/desk` and the rest still
// resolve, they simply light up the section they now belong to.

export const STUDIO_SECTIONS = [
  "today",
  "work",
  "clients",
  "studio",
  "library",
  "releases",
  "business",
] as const;

export type StudioSection = (typeof STUDIO_SECTIONS)[number];

export interface StudioNavItem {
  section: StudioSection;
  to: string;
  label: string;
  /** End-match for NavLink — only Today, which is the index route. */
  end?: boolean;
}

export const STUDIO_NAV: StudioNavItem[] = [
  { section: "today", to: "/admin-v2", label: "Today", end: true },
  { section: "work", to: "/admin-v2/work", label: "Projects & Tasks" },
  { section: "clients", to: "/admin-v2/people", label: "Client Spaces" },
  { section: "studio", to: "/admin-v2/creative", label: "Creative Studio" },
  { section: "library", to: "/admin-v2/library", label: "Asset Library" },
  { section: "releases", to: "/admin-v2/releases", label: "Releases" },
  { section: "business", to: "/admin-v2/commerce", label: "Business" },
];

export const SECTION_LABEL: Record<StudioSection, string> = Object.fromEntries(
  STUDIO_NAV.map((n) => [n.section, n.label]),
) as Record<StudioSection, string>;

/**
 * Creative used to hold the library shelves too. A link that still says
 * `/admin-v2/creative?tab=designs` (Overview, old bookmarks, the command
 * search) is asking for the Library and is forwarded there.
 */
export const LIBRARY_TABS = ["designs", "mockups"] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

export function isLibraryTab(tab: string | null | undefined): tab is LibraryTab {
  return (LIBRARY_TABS as readonly string[]).includes(tab ?? "");
}

/** Which section an /admin-v2 address belongs to. */
export function sectionOf(pathname: string, search = ""): StudioSection {
  const path = pathname.replace(/\/+$/, "");
  const rest = path.startsWith("/admin-v2") ? path.slice("/admin-v2".length) : path;
  const first = rest.split("/").filter(Boolean)[0] ?? "";

  switch (first) {
    case "":
      return "today";
    case "work":
    case "desk":
      return "work";
    case "people":
      return "clients";
    case "creative": {
      const tab = new URLSearchParams(search).get("tab");
      const stage = new URLSearchParams(search).get("stage");
      return isLibraryTab(tab) || (!tab && stage) ? "library" : "studio";
    }
    case "library":
      return "library";
    case "releases":
    case "review":
      return "releases";
    case "commerce":
    case "orders":
    case "products":
      return "business";
    default:
      return "today";
  }
}
