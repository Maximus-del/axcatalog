// Mobile-first. Test at 375px before merging.
//
// Admin-specific bottom nav config. Renders nothing on >=md.

import {
  ClipboardList,
  Download,
  FolderKanban,
  LayoutDashboard,
  Package,
  Palette,
  Shirt,
  Trophy,
  Users,
} from "lucide-react";
import { MobileBottomNav, type BottomNavItem } from "@/components/mobile/MobileBottomNav";

const PRIMARY: BottomNavItem[] = [
  { label: "Home", to: "/admin", icon: LayoutDashboard, end: true },
  { label: "Products", to: "/admin/products", icon: Package },
  { label: "Athletes", to: "/admin/athletes", icon: Users },
  { label: "Orders", to: "/admin/orders", icon: ClipboardList },
];

const MORE: BottomNavItem[] = [
  { label: "Designs", to: "/admin/designs", icon: Palette },
  { label: "Blanks", to: "/admin/blanks", icon: Shirt },
  { label: "Teams", to: "/admin/teams", icon: Trophy },
  { label: "Collections", to: "/admin/collections", icon: FolderKanban },
  { label: "Ingestion", to: "/admin/ingestion", icon: Download },
];

export function AdminBottomNav() {
  return <MobileBottomNav primary={PRIMARY} more={MORE} />;
}
