import { Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";

export default function PortalLayout() {
  const { user, signOut, role } = useAuth();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-dark">
        <Wordmark size="sm" />
        <div className="flex items-center gap-3">
          {role === "admin" && (
            <span className="ax-badge-success">Admin view</span>
          )}
          <span className="text-xs text-muted-foreground hidden sm:block">{user?.email}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-muted-foreground hover:text-accent"
          >
            <LogOut className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
