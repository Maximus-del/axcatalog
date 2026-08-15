import {
  Home,
  Inbox,
  CheckSquare,
  Package,
  FolderKanban,
  ClipboardList,
  DollarSign,
  Users,
  Trophy,
  Building2,
  Palette,
  Shapes,
  Image as ImageIcon,
  Sparkles,
  Truck,
  Printer,
  Shirt,
  BarChart3,
  Settings,
  UserCog,
  Newspaper,
  Star,
  CalendarDays,
  LayoutTemplate,
  type LucideIcon,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/Wordmark";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Ecosystem",
    items: [
      { label: "Overview", to: "/admin", icon: Home, end: true },
      { label: "Athletes", to: "/admin/athletes", icon: Users },
      { label: "Analytics", to: "/admin/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Content", to: "/admin/content", icon: Newspaper },
      { label: "Designs", to: "/admin/designs", icon: Palette },
      { label: "Design Templates", to: "/admin/design-templates", icon: Shapes },
      { label: "Mockups", to: "/admin/mockups", icon: ImageIcon },
      { label: "Brand Assets", to: "/admin/brand-assets", icon: Sparkles },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Products", to: "/admin/products", icon: Package },
      { label: "Collections", to: "/admin/collections", icon: FolderKanban },
      { label: "Orders", to: "/admin/orders", icon: ClipboardList },
      { label: "Blanks", to: "/admin/blanks", icon: Shirt },
      { label: "Pricing", to: "/admin/pricing-links", icon: DollarSign },
    ],
  },
  {
    label: "Access",
    items: [{ label: "Memberships", to: "/admin/access", icon: Star }],
  },
  {
    label: "Events",
    items: [{ label: "Camps & Events", to: "/admin/events", icon: CalendarDays }],
  },
  {
    label: "Operations",
    items: [
      { label: "Inbox", to: "/admin/inbox", icon: Inbox },
      { label: "Tasks", to: "/admin/tasks", icon: CheckSquare },
      { label: "Fulfillment", to: "/admin/fulfillment", icon: Truck },
      { label: "Print Queue", to: "/admin/print-queue", icon: Printer },
    ],
  },
  {
    label: "Clients",
    items: [
      { label: "Teams", to: "/admin/teams", icon: Trophy },
      { label: "Organizations", to: "/admin/organizations", icon: Building2 },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Templates", to: "/admin/templates", icon: LayoutTemplate },
      { label: "Team", to: "/admin/users", icon: UserCog },
      { label: "Settings", to: "/admin/settings", icon: Settings },
    ],
  },
];

interface Props {
  onNavigate?: () => void;
}

export function AdminSidebar({ onNavigate }: Props) {
  const { pathname } = useLocation();
  return (
    <aside className="h-full w-64 shrink-0 bg-[hsl(var(--ax-sidebar))] border-r border-[hsl(var(--ax-border))] flex flex-col">
      <div className="h-16 flex items-center px-5 border-b border-[hsl(var(--ax-border))]">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-[10px] bg-[hsl(var(--ax-accent))] text-white flex items-center justify-center font-bold">
            X
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-bold text-[hsl(var(--ax-ink))]">AthleteXclusive</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">OS</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scroll-touch">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">
              {g.label}
            </div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = it.end
                  ? pathname === it.to
                  : pathname.startsWith(it.to);
                const Icon = it.icon;
                return (
                  <li key={it.to}>
                    <NavLink
                      to={it.to}
                      end={it.end}
                      onClick={onNavigate}
                      className={cn(
                        "group flex items-center gap-2.5 h-9 px-3 rounded-[10px] text-[13px] font-medium transition-colors",
                        active
                          ? "bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                          : "text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))] hover:bg-[hsl(var(--ax-line))]",
                      )}
                    >
                      <Icon className={cn("h-[15px] w-[15px] shrink-0", active && "text-[hsl(var(--ax-accent))]")} />
                      <span className="truncate">{it.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
