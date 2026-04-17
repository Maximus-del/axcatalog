import { ChevronDown } from "lucide-react";
import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  title: string;
  defaultOpen?: boolean;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Collapsible portal section. Header click toggles open state.
 * Accent-green uppercase title with chevron.
 */
export function PortalSection({
  id,
  title,
  defaultOpen = true,
  description,
  actions,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="scroll-mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 py-3 text-left group"
      >
        <span className="ax-section-header" style={{ letterSpacing: "0.22em" }}>
          {title}
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-accent transition-transform duration-200 shrink-0",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && (
        <div className="pt-2 pb-8">
          {(description || actions) && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              {description && <div className="text-sm text-muted-foreground">{description}</div>}
              {actions && <div className="flex-shrink-0">{actions}</div>}
            </div>
          )}
          {children}
        </div>
      )}
    </section>
  );
}
