// Mobile-first. Test at 375px before merging.
//
// Four thumb-reachable slots for the things you open standing up, and a More
// sheet for the rest. The sheet is ordered the way the sidebar is — the daily
// few first, then creative, then the back office — so the two navigations
// don't teach different mental models.

import {
  ClipboardList,
  LayoutDashboard,
  Package,
  Users,
  Inbox,
  ListChecks,
  Palette,
  FolderKanban,
  Shirt,
  Trophy,
  Star,
  BarChart3,
  Truck,
  Settings,
} from "lucide-react";
import { MobileBottomNav, type BottomNavItem } from "@/components/mobile/MobileBottomNav";

const PRIMARY: BottomNavItem[] = [
  { label: "Home", to: "/admin", icon: LayoutDashboard, end: true },
  { label: "Products", to: "/admin/products", icon: Package },
  { label: "Athletes", to: "/admin/athletes", icon: Users },
  { label: "Orders", to: "/admin/orders", icon: ClipboardList },
];

const MORE: BottomNavItem[] = [
  { label: "Inbox", to: "/admin/inbox", icon: Inbox },
  { label: "Tasks", to: "/admin/tasks", icon: ListChecks },
  { label: "Designs", to: "/admin/designs", icon: Palette },
  { label: "Collections", to: "/admin/collections", icon: FolderKanban },
  { label: "Blanks", to: "/admin/blanks", icon: Shirt },
  { label: "Teams", to: "/admin/teams", icon: Trophy },
  { label: "Memberships", to: "/admin/access", icon: Star },
  { label: "Fulfillment", to: "/admin/fulfillment", icon: Truck },
  { label: "Analytics", to: "/admin/analytics", icon: BarChart3 },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];

export function AdminBottomNav() {
  return <MobileBottomNav primary={PRIMARY} more={MORE} />;
}
