// Mobile-first. The client's title card — the first thing on their home page.
//
// Words and colours come from the portal theme AX sets in V2; nothing here is
// client-editable. Renders nothing until a headline is set, so a client with
// no theme sees exactly the home page they saw before this existed.
//
// Built only from theme tokens (--accent, --dark, --portal-title), so a
// redesign — by hand or from Lovable — keeps working per client as long as it
// keeps using them. It is a natural slot for the era figurine artwork later.
import { hasTitleCard, type PortalTheme } from "@/lib/portal/portal-theme";

export function PortalTitleCard({ theme }: { theme: PortalTheme }) {
  if (!hasTitleCard(theme)) return null;
  const { eyebrow, headline, subline } = theme.titleCard;

  return (
    <section
      aria-label={headline}
      className="relative overflow-hidden rounded-2xl border border-border px-5 py-7 sm:px-8 sm:py-10"
      style={{
        background:
          "radial-gradient(120% 140% at 100% 0%, hsl(var(--accent) / 0.35) 0%, transparent 55%), linear-gradient(160deg, hsl(var(--dark)) 0%, hsl(var(--background)) 100%)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -bottom-16 h-48 w-48 rounded-full blur-3xl"
        style={{ background: "hsl(var(--accent) / 0.25)" }}
      />
      {eyebrow && (
        <p className="relative text-[10px] font-bold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      )}
      <h2
        className="relative mt-1.5 font-black uppercase leading-[0.95] tracking-tight text-[32px] sm:text-[44px] break-words"
        style={{ color: "hsl(var(--portal-title, var(--foreground)))" }}
      >
        {headline}
      </h2>
      {subline && <p className="relative mt-2 max-w-xl text-sm text-muted-foreground">{subline}</p>}
    </section>
  );
}
