import { useMemo, useState } from "react";
import { Check, ImagePlus, Link2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useDeleteAssetBrief,
  useSaveAssetBrief,
  type AssetBrief,
  type AssetBriefStatus,
} from "@/lib/v2/data";
import { AssetImage } from "./primitives";

// TURN INTO ASSETS — the brief, which is now a real object.
//
// An Asset is creative or media derived FROM one or more mockups: a story
// frame, a campaign graphic, a launch post. It is a different object from the
// mockup and from the product, and the relationship that matters is "this came
// from that".
//
// WHAT CHANGED. This screen used to hold everything in component state and save
// nothing — an operator could choose a type, gather references and write a
// careful instruction, close the drawer, and lose all of it. A tool that
// discards considered work is worse than one that never offered to take it.
// The brief now persists to `asset_briefs`, so it can be picked up tomorrow,
// handed to someone else, and eventually handed to a generator.
//
// WHAT STILL DOES NOT EXIST. Generation. That is stated on the screen rather
// than implied, because the honest version of "not built yet" is a labelled
// gap, not a button that does nothing.

/**
 * What an asset can be made FROM.
 *
 * Deliberately narrower than `Mockup`: this screen needs a picture, a name and
 * enough context to caption it. Typing it this way lets Creative pass mockups
 * it read from the global list without loading one entity's whole library.
 */
export interface AssetSource {
  id: string;
  title: string;
  imageUrl: string | null;
  imageBucket: string | null;
  imagePath: string | null;
  blankName?: string | null;
  colorName?: string | null;
}

/**
 * The output types AX actually makes, each with the shape it wants.
 *
 * A short list on purpose, and it is Chase's list rather than a guess: the
 * taxonomy should come from what gets made, not from what a dropdown could
 * plausibly contain.
 */
export const ASSET_TYPES = [
  { key: "feed", label: "Instagram post", ratio: "4:5" },
  { key: "story", label: "Instagram story", ratio: "9:16" },
  { key: "promo", label: "Promotional graphic", ratio: "1:1" },
  { key: "launch", label: "Product launch graphic", ratio: "4:5" },
  { key: "banner", label: "Website banner", ratio: "16:9" },
  { key: "email", label: "Email graphic", ratio: "3:2" },
  { key: "lookbook", label: "Lookbook image", ratio: "4:5" },
  { key: "feature", label: "Product feature graphic", ratio: "1:1" },
  { key: "other", label: "Something else", ratio: null },
] as const;

const RATIOS = ["1:1", "4:5", "9:16", "16:9", "3:2"] as const;

const STATUSES: { key: AssetBriefStatus; label: string; blurb: string }[] = [
  { key: "draft", label: "Draft", blurb: "Still being written." },
  { key: "ready", label: "Ready to make", blurb: "Everything it needs is here." },
  { key: "complete", label: "Done", blurb: "The asset exists." },
  { key: "archived", label: "Archived", blurb: "Not happening." },
];

export default function AssetsDrawer({
  organizationId,
  entityId,
  entityName,
  candidates,
  initialMockupIds = [],
  brief,
  onClose,
}: {
  organizationId: string;
  entityId: string | null;
  entityName: string;
  /** Mockups that can be added to this brief. */
  candidates: AssetSource[];
  initialMockupIds?: string[];
  /** Editing an existing brief rather than starting one. */
  brief?: AssetBrief | null;
  onClose: () => void;
}) {
  const save = useSaveAssetBrief();
  const remove = useDeleteAssetBrief();

  const [selected, setSelected] = useState<string[]>(
    brief ? brief.mockups.map((m) => m.mockupId) : initialMockupIds,
  );
  const [assetType, setAssetType] = useState<string>(brief?.assetType ?? "feed");
  const [ratio, setRatio] = useState<string | null>(
    brief?.aspectRatio ?? ASSET_TYPES.find((t) => t.key === "feed")?.ratio ?? null,
  );
  const [instructions, setInstructions] = useState(brief?.instructions ?? "");
  const [status, setStatus] = useState<AssetBriefStatus>(brief?.status ?? "draft");
  const [title, setTitle] = useState(brief?.title ?? "");
  const [refUrls, setRefUrls] = useState<string[]>(
    brief ? brief.references.map((r) => r.url ?? "").filter(Boolean) : [],
  );
  const [files, setFiles] = useState<File[]>([]);
  const [pastedUrl, setPastedUrl] = useState("");
  const [picking, setPicking] = useState(false);

  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const chosen = selected.map((id) => byId.get(id)).filter(Boolean) as AssetSource[];
  const spec = ASSET_TYPES.find((t) => t.key === assetType);

  /** A name AX can find this by later, without making the operator invent one. */
  const suggested =
    title.trim() ||
    [entityName, spec?.label, chosen[0]?.title].filter(Boolean).slice(0, 2).join(" · ") ||
    "Asset brief";

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const commit = async (nextStatus: AssetBriefStatus) => {
    if (selected.length === 0) {
      toast.error("An asset is made from a mockup", { description: "Pick at least one to work from." });
      return;
    }
    try {
      await save.mutateAsync({
        id: brief?.id ?? null,
        organizationId,
        entityId,
        title: suggested,
        assetType,
        aspectRatio: ratio,
        instructions,
        status: nextStatus,
        mockupIds: selected,
        referenceUrls: refUrls,
        files,
      });
      setFiles([]);
      toast.success(brief ? "Brief updated" : "Brief saved", {
        description:
          nextStatus === "ready"
            ? "Marked ready. Generation is not connected yet — the brief is what gets handed to it."
            : `Filed under ${entityName}.`,
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that brief");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="admin-os relative flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-canvas))] text-[hsl(var(--ax-ink))] sm:h-[86vh] sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-[hsl(var(--ax-line))] px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-[hsl(var(--ax-accent))]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{brief ? "Asset brief" : "Turn into an asset"}</div>
            <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">
              {entityName}
              {chosen.length > 0 && ` · from ${chosen.length} mockup${chosen.length === 1 ? "" : "s"}`}
            </div>
          </div>
          {brief && (
            <button
              type="button"
              onClick={() =>
                remove.mutate(brief.id, {
                  onSuccess: () => {
                    toast.success("Brief deleted");
                    onClose();
                  },
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete that"),
                })
              }
              title="Delete this brief"
              className="rounded-lg p-1.5 text-[hsl(var(--ax-amber))] hover:bg-white/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-touch p-4">
          <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
            {/* ------------------------------------------------ sources */}
            <div>
              <SectionLabel>Made from</SectionLabel>
              {chosen.length === 0 ? (
                <p className="text-[11px] text-[hsl(var(--ax-faint))]">Nothing chosen yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {chosen.map((m) => (
                    <div key={m.id} className="relative">
                      <AssetImage
                        url={m.imageUrl}
                        bucket={m.imageBucket}
                        path={m.imagePath}
                        alt={m.title}
                        className="aspect-square w-full rounded-xl border border-[hsl(var(--ax-border))] bg-white/[0.03]"
                        fit="contain"
                      />
                      <button
                        type="button"
                        onClick={() => toggle(m.id)}
                        aria-label={`Remove ${m.title}`}
                        className="absolute -right-1.5 -top-1.5 rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] p-1 text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="mt-1 truncate text-[10px] text-[hsl(var(--ax-faint))]">{m.title}</div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setPicking((v) => !v)}
                className="mt-2 w-full rounded-xl border border-dashed border-[hsl(var(--ax-border))] px-3 py-2 text-[11px] text-[hsl(var(--ax-secondary))] transition-colors hover:border-[hsl(var(--ax-accent)/0.6)]"
              >
                {picking ? "Done choosing" : "Add another mockup"}
              </button>

              {/*
                Several mockups per asset is the normal case, not the exception:
                a launch graphic is usually the range, not one garment.
              */}
              {picking && (
                <div className="mt-2 grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto scroll-touch rounded-xl border border-[hsl(var(--ax-border))] p-1.5">
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      title={c.title}
                      className={`relative overflow-hidden rounded-lg border transition-all ${
                        selected.includes(c.id)
                          ? "border-[hsl(var(--ax-accent))]"
                          : "border-transparent hover:border-white/25"
                      }`}
                    >
                      <AssetImage
                        url={c.imageUrl}
                        bucket={c.imageBucket}
                        path={c.imagePath}
                        alt={c.title}
                        className="aspect-square w-full bg-white/[0.03]"
                        fit="contain"
                      />
                      {selected.includes(c.id) && (
                        <span className="absolute left-1 top-1 rounded-full bg-[hsl(var(--ax-accent))] p-0.5 text-[hsl(var(--ax-on-accent))]">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </button>
                  ))}
                  {candidates.length === 0 && (
                    <p className="col-span-3 px-2 py-4 text-center text-[11px] text-[hsl(var(--ax-faint))]">
                      No other mockups here yet.
                    </p>
                  )}
                </div>
              )}

              <p className="mt-3 text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
                Everything made from this brief stays linked to the mockups above, so an asset can always be traced
                back to the artwork and garment it came from.
              </p>
            </div>

            {/* -------------------------------------------------- brief */}
            <div className="space-y-5">
              <section>
                <SectionLabel>1 · What are you making?</SectionLabel>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {ASSET_TYPES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        setAssetType(t.key);
                        if (t.ratio) setRatio(t.ratio);
                      }}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                        assetType === t.key
                          ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.1)]"
                          : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.5)]"
                      }`}
                    >
                      <div className="text-[12px] font-medium">{t.label}</div>
                      <div className="text-[10px] text-[hsl(var(--ax-faint))]">{t.ratio ?? "any shape"}</div>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <SectionLabel>2 · Shape</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {RATIOS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRatio(r)}
                      className={`rounded-full px-3 py-1 text-[11px] transition-colors ${
                        ratio === r
                          ? "bg-[hsl(var(--ax-accent)/0.16)] text-[hsl(var(--ax-accent))]"
                          : "bg-white/[0.06] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <SectionLabel>3 · References</SectionLabel>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[hsl(var(--ax-border))] px-4 py-3 text-[12px] text-[hsl(var(--ax-secondary))] hover:border-[hsl(var(--ax-accent)/0.6)]">
                  <ImagePlus className="h-4 w-4 shrink-0" />
                  Add references — a look, a layout, a past post to match
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
                      e.target.value = "";
                    }}
                  />
                </label>

                <div className="mt-2 flex gap-1.5">
                  <input
                    value={pastedUrl}
                    onChange={(e) => setPastedUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const url = pastedUrl.trim();
                      if (!url) return;
                      setRefUrls((prev) => [...prev, url]);
                      setPastedUrl("");
                    }}
                    placeholder="…or paste an image URL and press Enter"
                    className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2.5 py-1.5 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
                  />
                </div>

                {(refUrls.length > 0 || files.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {refUrls.map((u, i) => (
                      <span
                        key={`${u}-${i}`}
                        className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px]"
                      >
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{u.split("/").pop() ?? u}</span>
                        <button
                          type="button"
                          onClick={() => setRefUrls((prev) => prev.filter((_, j) => j !== i))}
                          aria-label="Remove reference"
                          className="text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {files.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent)/0.14)] px-2.5 py-1 text-[11px] text-[hsl(var(--ax-accent))]"
                      >
                        {f.name}
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                          aria-label={`Remove ${f.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <SectionLabel>4 · Instructions</SectionLabel>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={5}
                  placeholder="What should this asset do? Who is it for, what should it say, what should it feel like?"
                  className="w-full resize-none rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2.5 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
                />
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Name it — defaults to “${suggested}”`}
                  className="mt-2 w-full rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
                />
              </section>

              <section>
                <SectionLabel>5 · Where it stands</SectionLabel>
                <div className="grid gap-1 sm:grid-cols-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setStatus(s.key)}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                        status === s.key
                          ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]"
                          : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.5)]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-[12px] font-medium">{s.label}</span>
                        <span className="block text-[10px] text-[hsl(var(--ax-faint))]">{s.blurb}</span>
                      </span>
                      {status === s.key && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-accent))]" />}
                    </button>
                  ))}
                </div>
              </section>

              {/*
                The gap, labelled. A disabled "Generate" button that has never
                worked teaches an operator to distrust every other button on the
                screen; a stated boundary does not.
              */}
              <section className="rounded-xl border border-dashed border-[hsl(var(--ax-border))] px-4 py-3">
                <h3 className="text-[13px] font-semibold text-[hsl(var(--ax-secondary))]">Generation — not connected</h3>
                <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-[hsl(var(--ax-faint))]">
                  Everything above is saved and can be picked up later or handed to someone else. When generation is
                  wired, this brief is what it receives — the mockups, the shape, the references and the instruction —
                  and the results come back onto this brief as outputs.
                </p>
              </section>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void commit(status)}
                  disabled={save.isPending}
                  className="rounded-full bg-[hsl(var(--ax-accent))] px-5 py-2 text-[13px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50"
                >
                  {save.isPending ? "Saving…" : brief ? "Save changes" : "Save brief"}
                </button>
                {status !== "ready" && (
                  <button
                    type="button"
                    onClick={() => void commit("ready")}
                    disabled={save.isPending}
                    className="rounded-full border border-[hsl(var(--ax-border))] px-4 py-2 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))] disabled:opacity-50"
                  >
                    Save as ready to make
                  </button>
                )}
                <span className="text-[11px] text-[hsl(var(--ax-faint))]">
                  {selected.length === 0 ? "Pick a mockup first." : `${selected.length} source${selected.length === 1 ? "" : "s"}.`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 text-[13px] font-semibold">{children}</h3>;
}
