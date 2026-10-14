// Mobile-first. Test at 375px before merging.
//
// The phone gets the same four departments as the rail, because a navigation
// that teaches one model on desktop and another on a phone teaches neither.
// Home plus three departments are thumb-reachable; the fourth department and
// the utilities live in the More sheet, ordered exactly as the rail is.
import { Home, Inbox, ListChecks, BarChart3, Settings } from "lucide-react";
import { MobileBottomNav, type BottomNavItem } from "@/components/mobile/MobileBottomNav";
import { DEPARTMENTS } from "@/lib/admin-ia";

const depts: BottomNavItem[] = DEPARTMENTS.map((d) => ({
  label: d.label,
  to: d.home,
  icon: d.icon,
}));

// Four slots total, and one has to be Home — so three departments fit.
const PRIMARY: BottomNavItem[] = [
  { label: "Home", to: "/admin", icon: Home, end: true },
  ...depts.slice(0, 3),
];

const MORE: BottomNavItem[] = [
  ...depts.slice(3),
  { label: "Inbox", to: "/admin/inbox", icon: Inbox },
  { label: "Tasks", to: "/admin/tasks", icon: ListChecks },
  { label: "Analytics", to: "/admin/analytics", icon: BarChart3 },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];

export function AdminBottomNav() {
  return <MobileBottomNav primary={PRIMARY} more={MORE} />;
}
