import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Package,
  User,
  Upload,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIONS = [
  { label: "Generate mockup", icon: Sparkles, to: "/admin/mockups" },
  { label: "Upload artwork", icon: Upload, to: "/admin/designs" },
  { label: "New athlete", icon: User, to: "/admin/athletes" },
  { label: "New product", icon: Package, to: "/admin/products" },
];

export function QuickActionsFab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div className="fixed right-4 z-40 bottom-20 md:bottom-6 print:hidden">
      {open && (
        <div
          className="fixed inset-0 -z-10 bg-black/10 animate-fade-in"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex flex-col items-end gap-2">
        {open &&
          ACTIONS.map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={() => go(a.to)}
              style={{ animationDelay: `${i * 30}ms` }}
              className="animate-fade-in flex items-center gap-2 pl-3 pr-4 py-2 rounded-full bg-white border border-[hsl(var(--ax-border))] shadow-[0_6px_20px_rgba(20,22,28,.08)] text-sm font-medium text-[hsl(var(--ax-ink))] hover:border-[hsl(var(--ax-accent))]"
            >
              <a.icon className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
              {a.label}
            </button>
          ))}

        <button
          type="button"
          aria-label={open ? "Close quick actions" : "Quick actions"}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "h-14 w-14 rounded-full bg-[hsl(var(--ax-accent))] text-white shadow-[0_10px_28px_rgba(46,139,87,.35)] flex items-center justify-center transition-transform",
            open && "rotate-45",
          )}
        >
          {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </button>
      </div>
    </div>
  );
}