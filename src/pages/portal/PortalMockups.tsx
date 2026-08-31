// Mobile-first. What AX has made for this athlete, shown as a presentation.
//
// CURATED, NOT A WINDOW INTO THE PRODUCTION LIBRARY.
//
// The operator's mockup shelf is a working surface: folders, statuses,
// lifecycle, approval state, the artwork behind each one. None of that belongs
// here. An athlete opening this should feel shown something, not given access
// to a system — so it is imagery first, one line of caption, and nothing that
// implies an internal process they are now responsible for.
//
// What reaches this page is decided in Postgres, not here: `client_mockups`
// returns only mockups explicitly shared with them. This file could not show
// something unshared if it tried.
import { useState } from "react";
import { X } from "lucide-react";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { useClientMockups, type ClientMockup } from "@/hooks/useClientMockups";
import { PortalSection } from "@/components/portal/PortalSection";
import { cn } from "@/lib/utils";

export default function PortalMockups() {
  const { athlete } = usePortalData();
  const { mockups, loading, available, error, refetch } = useClientMockups(athlete.id);
  const [open, setOpen] = useState<ClientMockup | null>(null);

  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5 pb-bottom-nav md:pb-32">
      <PortalSection
        id="sec-mockups"
        title="Made for you"
        description="Concepts the AX team has put together on real garments. Nothing here is on sale yet."
      >
        {/*
          The feature can be switched off at the database. That is a normal
          state, not a failure, and it should read like one.
        */}
        {!available && (
          <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            Nothing to show here yet. Your AX team will let you know when there is.
          </p>
        )}

        {available && error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-6 text-center">
            <p className="text-sm">That did not load.</p>
            <button
              type="button"
              onClick={refetch}
              className="pressable mt-3 rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground"
            >
              Try again
            </button>
          </div>
        )}

        {available && !error && loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-2xl bg-muted/40" />
            ))}
          </div>
        )}

        {available && !error && !loading && mockups.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            Nothing shared with you just yet.
          </p>
        )}

        {available && !error && mockups.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {mockups.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setOpen(m)}
                className="pressable group overflow-hidden rounded-2xl border border-border bg-card text-left"
              >
                <div className="aspect-square w-full overflow-hidden bg-muted/30">
                  {m.imageUrl ? (
                    <img
                      src={m.imageUrl}
                      alt={m.title}
                      loading="lazy"
                      className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      No preview
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <div className="truncate text-sm font-medium">{m.title}</div>
                  {/*
                    Garment and colour only. The blank name shown is the
                    client-facing one — the manufacturer's name is never sent
                    to this surface at all, so there is nothing to leak.
                  */}
                  <div className="truncate text-xs text-muted-foreground">
                    {[m.blankName, m.colorName].filter(Boolean).join(" · ") || " "}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </PortalSection>

      {open && <Lightbox mockup={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

/**
 * One mockup, big.
 *
 * No download, no share sheet, no "approve". Looking at it properly is the
 * whole job of this screen; anything else is a decision the athlete has not
 * been asked to make.
 */
function Lightbox({ mockup, onClose }: { mockup: ClientMockup; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/85" />
      <div className="relative mx-4 w-full max-w-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="pressable absolute -top-11 right-0 rounded-full border border-white/25 p-2 text-white/80"
        >
          <X className="h-4 w-4" />
        </button>
        {mockup.imageUrl ? (
          <img
            src={mockup.imageUrl}
            alt={mockup.title}
            className={cn("max-h-[72vh] w-full rounded-2xl bg-black/40 object-contain")}
          />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-black/40 text-sm text-white/60">
            No preview
          </div>
        )}
        <div className="mt-3 text-center">
          <div className="text-base font-medium text-white">{mockup.title}</div>
          <div className="text-xs text-white/60">
            {[mockup.blankName, mockup.colorName].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
    </div>
  );
}
