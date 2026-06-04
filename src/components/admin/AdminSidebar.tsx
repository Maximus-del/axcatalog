import {
  LayoutDashboard,
  Package,
  Palette,
  Shirt,
  Users,
  Trophy,
  FolderKanban,
  Download,
  ClipboardList,
  DollarSign,
  Upload,
  Wallet,
  Handshake,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Wordmark } from "@/components/brand/Wordmark";

const items = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true },
  { title: "Products", url: "/admin/products", icon: Package },
  { title: "Designs", url: "/admin/designs", icon: Palette },
  { title: "Blanks", url: "/admin/blanks", icon: Shirt },
  { title: "Athletes", url: "/admin/athletes", icon: Users },
  { title: "Teams", url: "/admin/teams", icon: Trophy },
  { title: "Collections", url: "/admin/collections", icon: FolderKanban },
  { title: "Ingestion", url: "/admin/ingestion", icon: Download },
  { title: "Orders", url: "/admin/orders", icon: ClipboardList },
  { title: "Imports", url: "/admin/imports/orders", icon: Upload },
  { title: "Pricing", url: "/admin/pricing", icon: DollarSign },
  { title: "Credits", url: "/admin/credits", icon: Wallet },
  { title: "Affiliates", url: "/admin/affiliates", icon: Handshake },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="bg-sidebar">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
          {collapsed ? (
            <span className="font-bold text-lg tracking-wider text-accent">X</span>
          ) : (
            <Wordmark size="sm" />
          )}
        </div>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="ax-label">Workspace</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = item.end
                  ? location.pathname === item.url
                  : location.pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={active}>
                      <NavLink
                        to={item.url}
                        end={item.end}
                        className="flex items-center gap-3 text-muted-foreground hover:text-foreground"
                        activeClassName="!text-accent !bg-[hsl(var(--accent)/0.08)]"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="text-sm font-medium">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
