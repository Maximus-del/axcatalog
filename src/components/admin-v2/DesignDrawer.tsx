import { useState } from "react";
import { ArrowUpRight, Image, Shirt, Sparkles, Wand2, X } from "lucide-react";
import type { Design, Entity } from "@/lib/v2/types";
import { cleanDesignTitle } from "@/lib/v2/concepts";
import { previewReadiness } from "@/lib/v2/visibility";
import { AssetImage, Chip } from "./primitives";

// A design's own page: everything creative that starts from one piece of
// artwork.
//
// The organising idea is that a design is a STARTING POINT, not a filed asset.
// Opening one should offer what you can make from it, which is why the tabs are
// verbs. "Place on blank" is live; the others are declared rather than hidden,
// because a tab you can see and cannot use yet tells you the shape of the tool,
// while a tab that does not exist tells you nothing.

type Tab = "place" | "social" | "quality";

export default function DesignDrawer({
  design,
  entity,
  onClose,
  onPlaceOnBlank,
}: {
  design: Design;
  entity: Entity;
  onClose: () => void;
  onPlaceOnBlank: () => void;
}) {
  const [tab, setTab] = useState<Tab>("place");
  const name = cleanDesignTitle(design.title) ?? "Untitled design";
  const readiness = previewReadiness(design);

  const tabs: Array<{ key: Tab; label: string; icon: typeof Shirt; ready: boolean }> = [
    { key: "place", label: "Place on blank", icon: Shirt, ready: true },
    { key: "social", label: "Social assets", icon: Sparkles, ready: false },
    { key: "quality", label: "Quality", icon: Wand2, ready: false },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="admin-os relative flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-canvas))] text-[hsl(var(--ax-ink))] sm:h-[80vh] sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-[hsl(var(--ax-line))] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{name}</div>
            <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">
              {entity.name} · design {design.id.replace(/-/g, "").slice(0, 6).toUpperCase()}
            </div>
          </div>
          <a
            href={`/admin/designs/${design.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[11px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
          >
            Open in V1 <ArrowUpRight className="h-3 w-3" />
          </a>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-[hsl(var(--ax-line))] px-4 py-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-colors ${
                  tab === t.key
                    ? "bg-[hsl(var(--ax-accent)/0.16)] text-[hsl(var(--ax-accent))]"
                    : "text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-secondary))]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {!t.ready && (
                  <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
                    soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-touch p-4">
          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            <div>
              <AssetImage
                bucket={design.fileBucket}
                path={design.filePath}
                alt={design.title}
                className="aspect-square w-full rounded-2xl border border-[hsl(var(--ax-border))] bg-black/30"
                fit="contain"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {design.productionReady ? (
                  <Chip tone="var(--ax-accent)">Production PNG</Chip>
                ) : (
                  <Chip tone="var(--ax-amber)">Concept art</Chip>
                )}
                {design.status === "archived" && <Chip tone="var(--ax-faint)">Archived</Chip>}
                <Chip tone={readiness === "ready" ? "var(--ax-accent)" : "var(--ax-secondary)"}>
                  {design.clientVisibility === "preview" ? "Client can see" : "Hidden from client"}
                </Chip>
              </div>
            </div>

            <div>
              {tab === "place" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[14px] font-semibold">Put this on a garment</h3>
                    <p className="mt-1 max-w-[52ch] text-[13px] leading-relaxed text-[hsl(var(--ax-secondary))]">
                      Choose a blank and colourway, then drag this artwork onto the front or back and size it by eye.
                      Print zones are drawn as guides and one-click fits — nothing moves your artwork on its own.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onPlaceOnBlank}
                    className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--ax-accent))] px-5 py-2.5 text-[13px] font-semibold text-[hsl(var(--ax-on-accent))]"
                  >
                    <Shirt className="h-4 w-4" />
                    Create mockup from this design
                  </button>
                  <p className="max-w-[52ch] text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
                    Saves a product concept — no product is created, nothing goes to Shopify, and no inventory is
                    touched. Come back tomorrow and run the same artwork across another dozen blanks in minutes.
                  </p>
                </div>
              )}

              {tab === "social" && (
                <PlannedTab
                  title="Social assets"
                  blurb="Generate deliverables from this artwork through a prompt library — IG stories, in-feed promotions, giveaway graphics — with prompts saved and organised per asset type so the same look is repeatable."
                  items={[
                    "IG story (9:16)",
                    "IG in-feed promotion (4:5)",
                    "Giveaway graphic",
                    "Announcement / drop graphic",
                  ]}
                  note="Not built yet. The prompt library is the part worth designing carefully — a shared library of named, versioned prompts per asset type, so a look can be reproduced months later rather than re-invented."
                />
              )}

              {tab === "quality" && (
                <PlannedTab
                  title="Quality"
                  blurb="Take a low-resolution or AI-generated design up to production quality, and record which file is the finished one."
                  items={["Upscale to print resolution", "Clean edges and remove halos", "Promote the result to the production PNG"]}
                  note={
                    design.productionReady
                      ? "This design already has an exported production file, so it would only be re-run deliberately."
                      : "This design has no production export yet — it is concept art. That is exactly the case this tab is for."
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A tab that exists but is not built.
 *
 * Deliberately specific about what it will do and honest that it does not do it
 * yet. A vague "coming soon" would be worse than nothing; a concrete list is a
 * design conversation the operator can push back on before it is built.
 */
function PlannedTab({
  title,
  blurb,
  items,
  note,
}: {
  title: string;
  blurb: string;
  items: string[];
  note: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <p className="mt-1 max-w-[52ch] text-[13px] leading-relaxed text-[hsl(var(--ax-secondary))]">{blurb}</p>
      </div>
      <ul className="grid gap-1.5">
        {items.map((i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded-xl border border-dashed border-[hsl(var(--ax-border))] px-3 py-2 text-[12px] text-[hsl(var(--ax-faint))]"
          >
            <Image className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {i}
          </li>
        ))}
      </ul>
      <p className="max-w-[52ch] rounded-xl bg-white/[0.04] px-3 py-2.5 text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
        {note}
      </p>
    </div>
  );
}
