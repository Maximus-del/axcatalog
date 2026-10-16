// Production prompts — the master ChatGPT prompt and a brief builder.
//
// The master prompt is pasted once (a ChatGPT Project's instructions, or the
// first message of a new chat). For each design, the brief built here goes
// with the approved art. Owners are clients or city lines; garments come from
// the real blanks so the folder names and color names match what can be
// ordered and what the Drive sync reads.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, X } from "lucide-react";
import { Card, Chip, Skeleton } from "@/components/admin-v2/primitives";
import { useBlanks, useEntities } from "@/lib/v2/data";
import {
  CITIES,
  MASTER_PROMPT,
  MASTER_PROMPT_VERSION,
  PLACEMENTS,
  baseThree,
  blankLabel,
  buildBrief,
  designFolder,
  fullMessage,
  garmentWord,
  ownerFromName,
  type BriefGarment,
  type BriefInput,
} from "@/lib/v2/production-brief";

const btn =
  "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))] disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-1.5 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50";
const inputCls =
  "w-full rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]";
const label = "mb-1 block text-[11px] font-semibold text-[hsl(var(--ax-secondary))]";

const DRAFT_KEY = "ax.v2.production-brief.draft";

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Could not copy. Select the text and copy it by hand.");
  }
}

interface Row extends BriefGarment {
  blankId: string;
}

interface Draft extends Omit<BriefInput, "garments"> {
  ownerKey: string;
  rows: Row[];
}

const EMPTY: Draft = {
  ownerKey: "",
  owner: "",
  lineCode: "",
  designName: "",
  rows: [],
  placement: PLACEMENTS[0],
  numberVariants: "none",
  notes: "",
};

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? ({ ...EMPTY, ...JSON.parse(raw) } as Draft) : null;
  } catch {
    return null;
  }
}

export function ProductionBrief({ ownerEntityId }: { ownerEntityId?: string | null }) {
  const entities = useEntities();
  const blanks = useBlanks();
  const [draft, setDraft] = useState<Draft>(() => loadDraft() ?? EMPTY);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // A private window just won't remember the draft.
    }
  }, [draft]);

  const clients = useMemo(
    () => [...(entities.data ?? [])].filter((e) => e.status !== "archived").sort((a, b) => a.name.localeCompare(b.name)),
    [entities.data],
  );

  // Opened from a client's page: start the brief for that client.
  useEffect(() => {
    if (!ownerEntityId || draft.ownerKey === `e:${ownerEntityId}`) return;
    const e = clients.find((c) => c.id === ownerEntityId);
    if (e) setDraft((d) => ({ ...d, ownerKey: `e:${e.id}`, owner: ownerFromName(e.name) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the client list arrives
  }, [ownerEntityId, clients]);

  function chooseOwner(key: string) {
    if (key.startsWith("c:")) {
      const code = key.slice(2);
      set({ ownerKey: key, owner: code, lineCode: code });
      return;
    }
    const e = clients.find((c) => `e:${c.id}` === key);
    set({ ownerKey: key, owner: e ? ownerFromName(e.name) : "", lineCode: draft.ownerKey.startsWith("c:") ? "" : draft.lineCode });
  }

  const blankList = blanks.data ?? [];
  function addGarment(blankId: string) {
    const b = blankList.find((x) => x.id === blankId);
    if (!b) return;
    const names = b.colors.filter((c) => c.available).map((c) => c.name);
    set({
      rows: [
        ...draft.rows,
        { blankId, garment: garmentWord(b.garmentType, b.name), blank: blankLabel(b.brand, b.styleNumber), colors: baseThree(names) },
      ],
    });
  }
  const updateRow = (i: number, patch: Partial<Row>) => set({ rows: draft.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const input: BriefInput = { ...draft, garments: draft.rows };
  const brief = buildBrief(input);
  const folder = designFolder(draft.lineCode, draft.designName);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <Card className="p-4">
        <div className="mb-3 text-[14px] font-semibold">Brief</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={label}>Owner</span>
            <select className={inputCls} value={draft.ownerKey} onChange={(e) => chooseOwner(e.target.value)} aria-label="Owner">
              <option value="">Choose a client or city</option>
              <optgroup label="Cities">
                {CITIES.map((c) => (
                  <option key={c.code} value={`c:${c.code}`}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Clients">
                {clients.map((c) => (
                  <option key={c.id} value={`e:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <span className={label}>Owner code</span>
            <input className={inputCls} value={draft.owner} onChange={(e) => set({ owner: e.target.value.toUpperCase() })} placeholder="MOONEY, ATL…" aria-label="Owner code" />
          </div>
          <div>
            <span className={label}>Line code</span>
            <input className={inputCls} value={draft.lineCode} onChange={(e) => set({ lineCode: e.target.value.toUpperCase() })} placeholder="MW, ATL — or leave empty" aria-label="Line code" />
          </div>
          <div>
            <span className={label}>Design name</span>
            <input className={inputCls} value={draft.designName} onChange={(e) => set({ designName: e.target.value })} placeholder="Strength Club" aria-label="Design name" />
          </div>
        </div>
        {folder && (
          <p className="mt-2 text-[12px] text-[hsl(var(--ax-faint))]">
            Drive folder: <span className="text-[hsl(var(--ax-ink))]">{folder}</span>
          </p>
        )}

        <div className="mt-4">
          <span className={label}>Garments</span>
          <div className="space-y-2">
            {draft.rows.map((r, i) => {
              const b = blankList.find((x) => x.id === r.blankId);
              const names = (b?.colors ?? []).filter((c) => c.available).map((c) => c.name);
              return (
                <div key={`${r.blankId}-${i}`} className="rounded-xl border border-[hsl(var(--ax-line))] p-2.5">
                  <div className="flex items-center gap-2">
                    <input className={`${inputCls} max-w-[150px]`} value={r.garment} onChange={(e) => updateRow(i, { garment: e.target.value.toUpperCase() })} aria-label="Garment" />
                    <span className="text-[12px] text-[hsl(var(--ax-faint))]">—</span>
                    <span className="flex-1 truncate text-[13px]">{r.blank}</span>
                    <button type="button" className={btn} aria-label="Remove garment" onClick={() => set({ rows: draft.rows.filter((_, j) => j !== i) })}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {names.map((n) => {
                      const on = r.colors.includes(n);
                      return (
                        <Chip key={n} active={on} onClick={() => updateRow(i, { colors: on ? r.colors.filter((c) => c !== n) : [...r.colors, n] })}>
                          {n}
                        </Chip>
                      );
                    })}
                    {names.length === 0 && <span className="text-[11px] text-[hsl(var(--ax-faint))]">No colors on file for this blank.</span>}
                  </div>
                </div>
              );
            })}
            {blanks.isLoading ? (
              <Skeleton className="h-9" />
            ) : (
              <div className="flex items-center gap-2">
                <Plus className="h-3.5 w-3.5 text-[hsl(var(--ax-faint))]" />
                <select className={inputCls} value="" onChange={(e) => addGarment(e.target.value)} aria-label="Add a garment">
                  <option value="">Add a garment…</option>
                  {blankList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {garmentWord(b.garmentType, b.name)} — {blankLabel(b.brand, b.styleNumber)}
                      {b.displayName ? ` · ${b.displayName}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-[hsl(var(--ax-faint))]">Adding a garment picks its Black, charcoal/graphite and brown. Tap colors to change them. Rename to TEE V2 for a second version.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <span className={label}>Placement</span>
            <input className={inputCls} list="ax-placements" value={draft.placement} onChange={(e) => set({ placement: e.target.value })} aria-label="Placement" />
            <datalist id="ax-placements">
              {PLACEMENTS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <span className={label}>Number variants</span>
            <input className={inputCls} value={draft.numberVariants} onChange={(e) => set({ numberVariants: e.target.value })} placeholder="none, or #11, #17" aria-label="Number variants" />
          </div>
        </div>
        <div className="mt-3">
          <span className={label}>Notes</span>
          <textarea className={`${inputCls} min-h-[72px]`} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Colors to keep, vibe for the variants…" aria-label="Notes" />
        </div>
        <button type="button" className={`${btn} mt-3`} onClick={() => setDraft({ ...EMPTY })}>
          Start over
        </button>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex-1 text-[14px] font-semibold">Brief to paste</span>
            <button type="button" className={btnPrimary} onClick={() => void copy(brief, "Brief copied")}>
              <Copy className="h-3.5 w-3.5" /> Copy brief
            </button>
          </div>
          <pre className="whitespace-pre-wrap rounded-lg bg-white/[0.04] p-3 text-[12.5px] leading-relaxed">{brief}</pre>
          <button type="button" className={`${btn} mt-2`} onClick={() => void copy(fullMessage(input), "Prompt + brief copied")}>
            <Copy className="h-3 w-3" /> Copy prompt + brief (new chat)
          </button>
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex-1 text-[14px] font-semibold">Master prompt</span>
            <span className="text-[11px] text-[hsl(var(--ax-faint))]">v{MASTER_PROMPT_VERSION}</span>
            <button type="button" className={btn} onClick={() => void copy(MASTER_PROMPT, "Master prompt copied")}>
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <p className="mb-2 text-[12px] text-[hsl(var(--ax-secondary))]">
            Paste once into a ChatGPT Project&apos;s instructions (or the first message of a new chat). Then send each design with its brief.
          </p>
          <details>
            <summary className="cursor-pointer text-[12px] text-[hsl(var(--ax-accent))]">Show the prompt</summary>
            <pre className="mt-2 max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/[0.04] p-3 text-[12px] leading-relaxed">{MASTER_PROMPT}</pre>
          </details>
        </Card>
      </div>
    </div>
  );
}
