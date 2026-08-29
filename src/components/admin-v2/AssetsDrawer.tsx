import { useState } from "react";
import { ImagePlus, Sparkles, X } from "lucide-react";
import type { Mockup } from "@/lib/v2/types";
import { AssetImage } from "./primitives";

// TURN INTO ASSETS — the entry point, deliberately not the engine.
//
// An Asset is creative or media derived FROM a mockup: a story frame, a
// campaign graphic, a launch post. It is a different object from the mockup and
// from the product, and the relationship that matters is "this came from that".
//
// This screen establishes the shape — pick a type, gather references, write the
// instruction — and stops short of generation. Building the AI execution before
// the object relationships are settled would mean rebuilding it once they are,
// and the prompt library Chase described (named, reusable prompts per asset
// type) is the part worth designing carefully rather than guessing at.
//
// Structure is intentionally the same as the Design Template workflow already
// in V1: references + prompt + source object.

const ASSET_TYPES = [
  { key: "story", label: "IG story", ratio: "9:16" },
  { key: "feed", label: "IG in-feed", ratio: "4:5" },
  { key: "giveaway", label: "Giveaway graphic", ratio: "1:1" },
  { key: "launch", label: "Launch / drop graphic", ratio: "4:5" },
  { key: "lookbook", label: "Lookbook page", ratio: "4:5" },
  { key: "other", label: "Something else", ratio: "—" },
] as const;

export default function AssetsDrawer({
  mockup,
  entityName,
  onClose,
}: {
  mockup: Mockup;
  entityName: string;
  onClose: () => void;
}) {
  const [type, setType] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [references, setReferences] = useState<File[]>([]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="admin-os relative flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-canvas))] text-[hsl(var(--ax-ink))] sm:h-[80vh] sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-[hsl(var(--ax-line))] px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-[hsl(var(--ax-accent))]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">Turn into Assets</div>
            <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">
              {entityName} · from “{mockup.title}”
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-touch p-4">
          <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                Source mockup
              </div>
              <AssetImage
                url={mockup.imageUrl}
                bucket={mockup.imageBucket}
                path={mockup.imagePath}
                alt={mockup.title}
                className="aspect-square w-full rounded-2xl border border-[hsl(var(--ax-border))] bg-white/[0.03]"
                fit="contain"
              />
              <p className="mt-2 text-[11px] text-[hsl(var(--ax-faint))]">
                {[mockup.blankName, mockup.colorName].filter(Boolean).join(" · ") || "No blank set"}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
                Anything created here stays linked to this mockup, so you can always trace an asset back to the
                artwork and garment it came from.
              </p>
            </div>

            <div className="space-y-5">
              <section>
                <h3 className="text-[13px] font-semibold">1 · What are you making?</h3>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {ASSET_TYPES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setType(t.key)}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                        type === t.key
                          ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.1)]"
                          : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.5)]"
                      }`}
                    >
                      <div className="text-[12px] font-medium">{t.label}</div>
                      <div className="text-[10px] text-[hsl(var(--ax-faint))]">{t.ratio}</div>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-[hsl(var(--ax-faint))]">
                  A short list on purpose. The full taxonomy should come from what you actually make, not from a guess
                  made up front.
                </p>
              </section>

              <section>
                <h3 className="text-[13px] font-semibold">2 · Reference images</h3>
                <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[hsl(var(--ax-border))] px-4 py-3 text-[12px] text-[hsl(var(--ax-secondary))] hover:border-[hsl(var(--ax-accent)/0.6)]">
                  <ImagePlus className="h-4 w-4 shrink-0" />
                  Add references — a look, a layout, a past post to match
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      setReferences((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {references.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {references.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px]"
                      >
                        {f.name}
                        <button
                          type="button"
                          onClick={() => setReferences((prev) => prev.filter((_, j) => j !== i))}
                          aria-label={`Remove ${f.name}`}
                          className="text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-[13px] font-semibold">3 · Instructions</h3>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  placeholder="What should this asset do? Who is it for, what should it say, what should it feel like?"
                  className="mt-2 w-full resize-none rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2.5 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
                  This becomes the first entry in the prompt library — saved, named and reusable per asset type, so a
                  look can be reproduced months later rather than re-invented.
                </p>
              </section>

              <section className="rounded-xl border border-dashed border-[hsl(var(--ax-border))] px-4 py-3">
                <h3 className="text-[13px] font-semibold text-[hsl(var(--ax-secondary))]">4 · Generate — not built yet</h3>
                <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-[hsl(var(--ax-faint))]">
                  Generation and saving assets back to {entityName} come next. The object relationships are settled
                  first on purpose: building the engine before we know what an Asset is would mean rebuilding it once
                  we do.
                </p>
              </section>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled
                  title="Generation is not wired up yet"
                  className="rounded-full bg-[hsl(var(--ax-accent))] px-5 py-2 text-[13px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-40"
                >
                  Generate assets
                </button>
                <span className="text-[11px] text-[hsl(var(--ax-faint))]">
                  {type ? "Type chosen." : "Choose a type first."}{" "}
                  {references.length > 0 && `${references.length} reference${references.length === 1 ? "" : "s"}. `}
                  {prompt.trim() ? "Instructions written." : ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
