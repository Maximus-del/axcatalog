// The look of every screen a person sees BEFORE they're in a portal — the
// invite, the questionnaire, the wait. Painted in the client's own theme
// (Proactive orange in the gym, Mooney green in the locker room), so the
// first impression is already theirs, not a generic AX login.
import type { CSSProperties, ReactNode } from "react";
import { parsePortalTheme, themeCssVars } from "@/lib/portal/portal-theme";
import { Wordmark } from "@/components/brand/Wordmark";

interface Props {
  theme?: unknown;
  entityName?: string;
  children: ReactNode;
}

export function ThemedGate({ theme, entityName, children }: Props) {
  const t = parsePortalTheme(theme);
  const hero = t.world.heroUrl;
  const logo = t.world.logoUrl;
  return (
    <div
      className="min-h-screen bg-background text-foreground relative overflow-hidden"
      style={themeCssVars(t) as CSSProperties}
    >
      {hero ? (
        <div aria-hidden className="absolute inset-0">
          <img src={hero} alt="" className="h-full w-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        </div>
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--accent)/0.18),transparent_60%)]" />
      )}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-10">
        <header className="mb-8 flex flex-col items-center gap-3 text-center">
          {logo ? (
            <img src={logo} alt={entityName ? `${entityName} logo` : ""} className="h-14 w-auto max-w-[200px] object-contain" />
          ) : (
            <Wordmark size="lg" />
          )}
          {entityName ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              {entityName} × Athlete Xclusive
            </p>
          ) : null}
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

export function GateCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border/70 bg-[hsl(var(--dark)/0.85)] p-6 shadow-2xl backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

export function RoleChip({ role }: { role: "owner" | "team" }) {
  return (
    <span className="inline-flex items-center rounded-full border border-accent/50 bg-accent/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-accent">
      {role === "owner" ? "Owner access" : "Team access"}
    </span>
  );
}
