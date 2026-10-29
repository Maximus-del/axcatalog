// The world shell's per-client settings, inside "Portal look".
//
// Everything the Locker Room used to hard-code for Mooney — the room's name,
// the welcome line, the moon, the locker photo — is a field here, so Proactive
// (a gym with plaques) and Mooney (a locker room with lockers) are the same
// shell with different answers.
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_WORLD, QUICK_PLAYS, normalizeHex, type PortalWorld, type QuickPlayKey } from "@/lib/portal/portal-theme";
import { uploadPortalAsset } from "@/lib/v2/portal-assets";

const input =
  "w-full rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]";
const label = "block text-[12px] font-medium";
const hint = "block text-[11px] text-[hsl(var(--ax-faint))]";

export function ImageField({
  entityId,
  kind,
  title,
  help,
  value,
  onChange,
  tall,
}: {
  entityId: string;
  kind: "logo" | "hero" | "plaque";
  title: string;
  help: string;
  value: string;
  onChange: (url: string) => void;
  tall?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadPortalAsset(entityId, kind, file));
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div>
      <span className={label}>{title}</span>
      <span className={hint}>{help}</span>
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void pick(e.dataTransfer.files?.[0]);
          }}
          className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-[hsl(var(--ax-border))] bg-[#141414] ${tall ? "h-20 w-36" : "h-16 w-16"}`}
          aria-label={value ? `Replace ${title.toLowerCase()}` : `Upload ${title.toLowerCase()}`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-white/70" />
          ) : value ? (
            <img src={value} alt="" className={`h-full w-full ${tall ? "object-cover" : "object-contain p-1.5"}`} />
          ) : (
            <ImagePlus className="h-4 w-4 text-white/60" />
          )}
        </button>
        <div className="min-w-0 flex-1 text-[11px] text-[hsl(var(--ax-faint))]">
          {value ? (
            <button type="button" onClick={() => onChange("")} className="inline-flex items-center gap-1 hover:text-[hsl(var(--ax-ink))]">
              <X className="h-3 w-3" /> Remove — use the default
            </button>
          ) : (
            "Click or drop a picture."
          )}
        </div>
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}

export default function WorldEditor({
  entityId,
  world,
  onChange,
}: {
  entityId: string;
  world: PortalWorld;
  onChange: (world: PortalWorld) => void;
}) {
  const [accent2Typed, setAccent2Typed] = useState(world.accent2);
  const set = <K extends keyof PortalWorld>(k: K, v: PortalWorld[K]) => onChange({ ...world, [k]: v });

  const togglePlay = (key: QuickPlayKey) => {
    const has = world.quickPlays.includes(key);
    if (has) set("quickPlays", world.quickPlays.filter((k) => k !== key));
    else if (world.quickPlays.length < 4) set("quickPlays", [...world.quickPlays, key]);
    else toast.message("Four shortcuts at most — remove one first.");
  };
  const movePlay = (key: QuickPlayKey, dir: -1 | 1) => {
    const list = [...world.quickPlays];
    const i = list.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set("quickPlays", list);
  };

  return (
    <div className="space-y-4 rounded-xl border border-[hsl(var(--ax-border))] p-3.5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">
        Their world <span className="normal-case tracking-normal">— the home room, its words and pictures</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ImageField entityId={entityId} kind="logo" title="Logo" help="Top of the sidebar. Transparent PNG is best." value={world.logoUrl} onChange={(v) => set("logoUrl", v)} />
        <ImageField entityId={entityId} kind="hero" title="Room photo" help="Behind the home page — no text or buttons in it." value={world.heroUrl} onChange={(v) => set("heroUrl", v)} tall />
        <ImageField entityId={entityId} kind="hero" title="Room photo — phone" help="Optional upright version for phones. Empty uses the room photo." value={world.heroMobileUrl} onChange={(v) => set("heroMobileUrl", v)} tall />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Home room name</span>
          <span className={hint}>Nav label — e.g. Locker Room, Gym HQ</span>
          <input className={`${input} mt-1.5`} maxLength={24} value={world.roomName} onChange={(e) => set("roomName", e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>Second colour</span>
          <span className={hint}>Small touches only — collection numbers. Optional.</span>
          <span className="mt-1.5 flex items-center gap-2">
            <input
              type="color"
              value={world.accent2 || "#000000"}
              onChange={(e) => {
                setAccent2Typed(e.target.value);
                set("accent2", e.target.value);
              }}
              aria-label="Second colour"
              className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-[hsl(var(--ax-border))] bg-transparent p-0.5"
            />
            <input
              type="text"
              value={accent2Typed}
              placeholder="none"
              spellCheck={false}
              onChange={(e) => {
                setAccent2Typed(e.target.value);
                if (!e.target.value.trim()) set("accent2", "");
                const hex = normalizeHex(e.target.value);
                if (hex) set("accent2", hex);
              }}
              className={`${input} font-mono uppercase`}
            />
          </span>
        </label>
      </div>

      <div className="grid gap-2">
        <label className="block">
          <span className={label}>Welcome line</span>
          <span className={hint}>{"{name}"} is their name, {"{room}"} the room. Then optional words in the accent colour.</span>
          <span className="mt-1.5 grid grid-cols-[1fr_minmax(0,40%)] gap-2">
            <input className={input} maxLength={80} value={world.headline} onChange={(e) => set("headline", e.target.value)} placeholder={DEFAULT_WORLD.headline} />
            <input className={input} maxLength={40} value={world.headlineAccent} onChange={(e) => set("headlineAccent", e.target.value)} placeholder="the Gym" />
          </span>
        </label>
        <label className="block">
          <span className={label}>Tagline</span>
          <input className={`${input} mt-1.5`} maxLength={80} value={world.tagline} onChange={(e) => set("tagline", e.target.value)} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Collections stand</span>
          <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="Collections stand">
            {(
              [
                ["locker", "In lockers"],
                ["pedestal", "On pedestals"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={world.stage === value}
                onClick={() => set("stage", value)}
                className={`rounded-full border px-3.5 py-1.5 text-[12px] ${
                  world.stage === value ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-accent))]" : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))]"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 self-end text-[12px]">
          <input type="checkbox" checked={world.showStats} onChange={(e) => set("showStats", e.target.checked)} />
          Show credit, revenue and order totals on the home page
        </label>
      </div>

      <div>
        <span className={label}>Quick Plays</span>
        <span className={hint}>Up to four shortcuts, in this order.</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {QUICK_PLAYS.map((p) => {
            const on = world.quickPlays.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={on}
                onClick={() => togglePlay(p.key)}
                className={`rounded-full border px-3 py-1.5 text-[12px] ${on ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-accent))]" : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))]"}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <ol className="mt-2 space-y-1">
          {world.quickPlays.map((key, i) => (
            <li key={key} className="flex items-center gap-2 text-[12px]">
              <span className="w-4 tabular-nums text-[hsl(var(--ax-faint))]">{i + 1}</span>
              <span className="flex-1">{QUICK_PLAYS.find((p) => p.key === key)?.label}</span>
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => movePlay(key, -1)} className="rounded p-1 disabled:opacity-30">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" aria-label="Move down" disabled={i === world.quickPlays.length - 1} onClick={() => movePlay(key, 1)} className="rounded p-1 disabled:opacity-30">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
