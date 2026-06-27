import { Sparkles } from "lucide-react";

export default function AdminPlaceholder({ title }: { title: string }) {
  return (
    <div className="p-6 md:p-8 max-w-[1200px] mx-auto">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))] font-semibold mb-1">
        {title}
      </div>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-6 text-[hsl(var(--ax-ink))]">
        {title}
      </h1>
      <div className="ax-os-card p-12 text-center flex flex-col items-center gap-3">
        <div className="h-12 w-12 rounded-[12px] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] flex items-center justify-center">
          <Sparkles className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-[hsl(var(--ax-ink))]">Coming soon</p>
        <p className="text-sm text-[hsl(var(--ax-secondary))] max-w-sm">
          This section is part of the AthleteXclusive OS roadmap and isn't built yet.
        </p>
      </div>
    </div>
  );
}
