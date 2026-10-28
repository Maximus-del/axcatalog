import { Suspense, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Images,
  Inbox,
  ScanEye,
  ListChecks,
  Rocket,
  Sparkles,
  Sunrise,
  Users,
  Ruler,
  Shirt,
  type LucideIcon,
} from "lucide-react";
import { useDeskWaitingCount } from "@/lib/v2/desk";
import { useOverview } from "@/lib/v2/data";
import { useOpenTaskCount } from "@/lib/v2/work";
import { usePendingReviewCount } from "@/lib/v2/content-review";
import { usePendingMockupCount } from "@/lib/v2/mockup-review";
import { SECTION_LABEL, STUDIO_NAV, sectionOf, type StudioSection } from "@/lib/v2/studio-nav";
import { entityHref } from "@/lib/v2/entity-nav";
import { tintOf } from "@/lib/v2/entity";
import CommandSearch from "./CommandSearch";
import StudioLoader from "./StudioLoader";
import { preloadV2Pages } from "@/lib/v2/page-loaders";
import "@/styles/ax-studio.css";

// AX STUDIO OS — the V2 shell.
//
// Seven sections from the approved design: Today, Projects & Tasks, Client
// Spaces, Creative Studio, Asset Library, Releases, Business. They are laid
// over the routes V2 already had (see studio-nav.ts) — every older V2 address
// still resolves and lights up the section it now belongs to.
//
// The light theme is a token swap: `.ax-studio` redefines the same --ax-*
// variables the dark `.admin-os` block defines, in a stylesheet only this lazy
// chunk imports. V1 at /admin keeps its own theme untouched.

const ICON: Record<StudioSection, LucideIcon> = {
  today: Sunrise,
  work: ListChecks,
  clients: Users,
  studio: Sparkles,
  library: Images,
  releases: Rocket,
  business: BarChart3,
};

/** Navigation colours on the dark rail (lighter than the in-page section colours). */
const NAV_COLOR: Record<StudioSection, string> = {
  today: "125 97% 34%",
  work: "44 86% 64%",
  clients: "181 57% 62%",
  studio: "266 91% 81%",
  library: "216 91% 77%",
  releases: "15 100% 77%",
  business: "125 97% 34%",
};

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Manrope:wght@600;700;800&display=swap";

/**
 * The Studio OS typefaces, loaded as an ordinary <link> once V2 mounts.
 * Deliberately not a CSS @import: a failed import rejects the lazy chunk's
 * CSS preload and takes the whole V2 route down with it. A failed <link> just
 * leaves the system font fallbacks in place.
 */
function useStudioFonts() {
  useEffect(() => {
    if (document.querySelector(`link[data-ax-studio-fonts]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    link.dataset.axStudioFonts = "1";
    document.head.appendChild(link);
  }, []);
}

export default function V2Layout() {
  useStudioFonts();
  // Every V2 page's code, fetched in the background once the shell is up, so
  // moving between sections never waits on a download.
  useEffect(() => preloadV2Pages(), []);
  const location = useLocation();
  const navigate = useNavigate();
  const section = sectionOf(location.pathname, location.search);

  // Briefs and messages from client portals that nobody at AX has answered.
  const deskWaiting = useDeskWaitingCount();
  const reviewWaiting = usePendingReviewCount();
  const mockupWaiting = usePendingMockupCount();
  const openTasks = useOpenTaskCount();
  const overview = useOverview();
  const shortcuts = (overview.data?.recentEntities ?? []).slice(0, 5);

  const isRoot = location.pathname === "/admin-v2" || location.pathname === "/admin-v2/";

  const badge = (s: StudioSection): number => (s === "work" ? openTasks + deskWaiting : 0);

  return (
    <div className="admin-os ax-studio min-h-screen w-full bg-[hsl(var(--ax-canvas))] text-[hsl(var(--ax-ink))]">
      {/* ------------------------------------------------ desktop rail */}
      <aside className="ax-studio-rail fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col px-3 pb-4 pt-6 lg:flex">
        <Link to="/admin-v2" className="mb-7 flex items-center gap-3 px-2.5 text-white">
          <span className="font-['Manrope'] text-[30px] font-extrabold leading-none tracking-[-0.08em]">AX</span>
          <span className="text-[11px] font-bold leading-tight tracking-[0.18em]">
            STUDIO OS
            <span className="mt-1 block text-[8px] font-medium tracking-[0.14em] text-[#97a8b3]">THE WORK, CONNECTED.</span>
          </span>
        </Link>

        <p className="ax-rail-label mb-2 px-3">Workspace</p>
        <nav className="flex flex-col gap-0.5" aria-label="AX Studio OS sections">
          {STUDIO_NAV.map((item) => {
            const Icon = ICON[item.section];
            const count = badge(item.section);
            const active = section === item.section;
            return (
              <div key={item.section}>
                {/*
                  A plain Link with the section computed by sectionOf(), not a
                  NavLink: Business must light up on /orders and /products, and
                  the Library on old /creative?tab=mockups links, which no
                  path match can express.
                */}
                <Link
                  to={item.to}
                  className={`ax-rail-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    active ? "active" : ""
                  }`}
                  style={{ ["--nav" as string]: NAV_COLOR[item.section] }}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {count > 0 && (
                    <span className="ax-rail-count rounded px-1.5 text-[10px] font-semibold leading-5 tabular-nums">
                      {count}
                    </span>
                  )}
                </Link>
                {/*
                  Client Desk is not in the prototype, but it is where portal
                  briefs and messages land. It sits under Projects & Tasks
                  because a client request is work someone has to pick up.
                */}
                {/* Content review sits under Releases: checking a piece is the last step before it ships. */}
                {item.section === "releases" && (
                  <NavLink
                    to="/admin-v2/review"
                    className={({ isActive }) =>
                      `ml-7 mt-0.5 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] transition-colors ${
                        isActive ? "bg-white/10 text-white" : "text-[#a9b8c2] hover:bg-[#273a46] hover:text-white"
                      }`
                    }
                  >
                    <ScanEye className="h-3.5 w-3.5" />
                    <span className="flex-1">Content review</span>
                    {reviewWaiting > 0 && (
                      <span className="rounded bg-[#e9b735] px-1.5 text-[10px] font-bold leading-4 text-[#2a1f00]" aria-label={`${reviewWaiting} to review`}>
                        {reviewWaiting}
                      </span>
                    )}
                  </NavLink>
                )}
                {item.section === "releases" && (
                  <NavLink to="/admin-v2/mockups-review" className={({ isActive }) =>
                      `ml-7 mt-0.5 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] transition-colors ${
                        isActive ? "bg-white/10 text-white" : "text-[#a9b8c2] hover:bg-[#273a46] hover:text-white"
                      }`
                    }>
                    <Shirt className="h-3.5 w-3.5" />
                    <span className="flex-1">Mockup review</span>
                    {mockupWaiting > 0 && (
                      <span className="rounded bg-[#e9b735] px-1.5 text-[10px] font-bold leading-4 text-[#2a1f00]" aria-label={`${mockupWaiting} mockups to review`}>
                        {mockupWaiting}
                      </span>
                    )}
                  </NavLink>
                )}
                {item.section === "releases" && (
                  <NavLink to="/admin-v2/placement" className={({ isActive }) =>
                      `ml-7 mt-0.5 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] transition-colors ${
                        isActive ? "bg-white/10 text-white" : "text-[#a9b8c2] hover:bg-[#273a46] hover:text-white"
                      }`
                    }>
                    <Ruler className="h-3.5 w-3.5" />
                    <span className="flex-1">Placement studio</span>
                  </NavLink>
                )}
                {item.section === "work" && (
                  <NavLink
                    to="/admin-v2/desk"
                    className={({ isActive }) =>
                      `ml-7 mt-0.5 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] transition-colors ${
                        isActive ? "bg-white/10 text-white" : "text-[#a9b8c2] hover:bg-[#273a46] hover:text-white"
                      }`
                    }
                  >
                    <Inbox className="h-3.5 w-3.5" />
                    <span className="flex-1">Client requests</span>
                    {deskWaiting > 0 && (
                      <span
                        className="rounded bg-[#e9b735] px-1.5 text-[10px] font-bold leading-4 text-[#2a1f00]"
                        aria-label={`${deskWaiting} waiting on AX`}
                      >
                        {deskWaiting}
                      </span>
                    )}
                  </NavLink>
                )}
              </div>
            );
          })}
        </nav>

        {shortcuts.length > 0 && (
          <div className="mt-7">
            <p className="ax-rail-label mb-2 px-3">Client spaces</p>
            {shortcuts.map((e) => (
              <NavLink
                key={e.id}
                to={entityHref(e.id)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] transition-colors ${
                    isActive ? "bg-white/10 text-white" : "text-[#c0cdd6] hover:bg-[#23343e] hover:text-white"
                  }`
                }
              >
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: tintOf(e.id) }} />
                <span className="truncate">{e.name}</span>
              </NavLink>
            ))}
          </div>
        )}

        <div className="mt-auto border-t border-[#2c3d47] pt-3">
          <a
            href="/admin"
            className="flex items-center justify-between rounded-lg px-3 py-2 text-[12px] text-[#a9b8c2] transition-colors hover:bg-[#23343e] hover:text-white"
            title="V1 stays available for everything V2 has not migrated"
          >
            V1 dashboard <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </aside>

      <div className="lg:pl-[232px]">
        {/* ------------------------------------------------ top bar */}
        <header className="sticky top-0 z-20 border-b border-[hsl(var(--ax-border))] bg-white/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <Link to="/admin-v2" className="flex shrink-0 items-center gap-1.5 lg:hidden">
              <span className="font-['Manrope'] text-[20px] font-extrabold tracking-[-0.08em]">AX</span>
              <span className="text-[10px] font-bold tracking-[0.16em] text-[hsl(var(--ax-secondary))]">STUDIO OS</span>
            </Link>

            {!isRoot && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Back to the previous page"
                title="Back"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))]"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}

            <div className="hidden min-w-0 flex-1 text-[12px] text-[hsl(var(--ax-secondary))] sm:block">
              Workspace <span className="mx-2.5 text-[hsl(var(--ax-border))]">/</span>
              <b className="font-semibold text-[hsl(var(--ax-ink))]">{SECTION_LABEL[section]}</b>
            </div>
            <div className="flex-1 sm:hidden" />

            <CommandSearch />

            <a
              href="/admin"
              className="hidden shrink-0 items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))] sm:flex lg:hidden"
              title="V1 stays available for everything V2 has not migrated"
            >
              V1 <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Phones and tablets: the seven sections as a scrolling row. */}
          <nav
            className="flex gap-1 overflow-x-auto scroll-touch px-3 pb-2 lg:hidden"
            aria-label="AX Studio OS sections"
          >
            {STUDIO_NAV.map((item) => {
              const Icon = ICON[item.section];
              const active = section === item.section;
              return (
                <Link
                  key={item.section}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    active
                      ? "bg-[hsl(var(--ax-sidebar))] text-white"
                      : "text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: active ? `hsl(${NAV_COLOR[item.section]})` : undefined }} />
                  {item.label}
                  {badge(item.section) > 0 && (
                    <span className="rounded bg-[hsl(var(--ax-amber))] px-1 text-[10px] font-bold leading-4 text-[#2a1f00]">
                      {badge(item.section)}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </header>

        <main
          key={location.pathname}
          data-section={section}
          className={`ax-page-in mx-auto px-4 pb-24 pt-7 sm:px-6 lg:px-8 ${
            section === "today" ? "max-w-[1310px]" : "max-w-[1440px]"
          }`}
        >
          {/*
            The shell's own Suspense boundary. Without it a page still loading
            fell through to the app-wide fallback, which replaced the WHOLE
            shell — rail and header included — with V1's dark screen. Now only
            the content area waits, on the light loader.
          */}
          <Suspense fallback={<StudioLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
