// How this client's portal looks — set here, seen there.
//
// Chase controls the look; the client never edits it. Colours and a title card,
// a live preview drawn with plain inline colours (so editing never re-skins V2
// itself), team presets from the entity's own team history, and a plain warning
// when a choice will be hard to read. Saved to athletes.metadata.portal_theme;
// see lib/portal/portal-theme.ts for why it is data and not code.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Loader2, Paintbrush, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_PORTAL_THEME,
  isDefaultTheme,
  normalizeHex,
  readableOn,
  themeWarnings,
  type PortalTheme,
} from "@/lib/portal/portal-theme";
import { usePortalThemeSettings, useSavePortalTheme } from "@/lib/v2/portal-theme-data";
import { entityPortalHref } from "@/lib/v2/entity-nav";

interface Props {
  entityId: string;
  entityName: string;
}

type ColourKey = "accent" | "header" | "background" | "title";

const COLOUR_FIELDS: { key: ColourKey; label: string; hint: string }[] = [
  { key: "accent", label: "Accent", hint: "Buttons and highlights" },
  { key: "header", label: "Header", hint: "The top band" },
  { key: "background", label: "Background", hint: "The page" },
  { key: "title", label: "Name colour", hint: "Their name and the title" },
];

export default function PortalThemeCard({ entityId, entityName }: Props) {
  const { data, isLoading, isError } = usePortalThemeSettings(entityId);
  const save = useSavePortalTheme(entityId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PortalTheme>(DEFAULT_PORTAL_THEME);
  // Text boxes hold what is typed, which may be half a hex code.
  const [typed, setTyped] = useState<Record<ColourKey, string>>({ ...DEFAULT_PORTAL_THEME });

  const saved = data?.theme ?? DEFAULT_PORTAL_THEME;
  useEffect(() => {
    if (!data) return;
    setDraft(data.theme);
    setTyped({ ...data.theme });
  }, [data]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const warnings = useMemo(() => themeWarnings(draft), [draft]);

  if (isLoading || isError) return null;

  function setColour(key: ColourKey, value: string) {
    setTyped((t) => ({ ...t, [key]: value }));
    const hex = normalizeHex(value);
    if (hex) setDraft((d) => ({ ...d, [key]: hex }));
  }

  function apply(theme: PortalTheme) {
    setDraft({ ...theme, titleCard: draft.titleCard, layout: draft.layout, brand: draft.brand });
    setTyped({ accent: theme.accent, header: theme.header, background: theme.background, title: theme.title });
  }

  function setCard(field: keyof PortalTheme["titleCard"], value: string) {
    setDraft((d) => ({ ...d, titleCard: { ...d.titleCard, [field]: value } }));
  }

  function submit(theme: PortalTheme, message: string) {
    save.mutate(theme, {
      onSuccess: () => toast.success(message),
      onError: (e) => toast.error(e.message),
    });
  }

  const custom = !isDefaultTheme(saved);

  return (
    <div className="mb-6">
      <div className="ax-card flex flex-wrap items-center gap-3 px-3.5 py-3">
        <span className="flex shrink-0 overflow-hidden rounded-lg border border-[hsl(var(--ax-border))]" aria-hidden>
          <span className="h-8 w-4" style={{ background: saved.header }} />
          <span className="h-8 w-4" style={{ background: saved.accent }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Portal look</div>
          <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">
            {custom
              ? saved.titleCard.headline
                ? `Custom · “${saved.titleCard.headline}”`
                : "Custom colours"
              : `Standard AX look — ${entityName} sees the default portal.`}
          </div>
        </div>
        <a
          href={entityPortalHref(entityId)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))]"
        >
          <Eye className="h-3.5 w-3.5" />
          See it
        </a>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))]"
          >
            <Paintbrush className="h-3.5 w-3.5" />
            Customize
          </button>
        )}
      </div>

      {open && (
        <div className="ax-card mt-1.5 grid gap-5 px-3.5 py-4 lg:grid-cols-[1fr_minmax(0,360px)]">
          <div className="min-w-0 space-y-5">
            {/* Presets */}
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">Start from</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[{ label: "AX default", theme: DEFAULT_PORTAL_THEME }, ...(data?.presets ?? [])].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => apply(p.theme)}
                    className="flex items-center gap-2 rounded-full border border-[hsl(var(--ax-border))] py-1.5 pl-1.5 pr-3 text-[12px] hover:border-[hsl(var(--ax-accent))]"
                  >
                    <span className="flex overflow-hidden rounded-full" aria-hidden>
                      <span className="h-5 w-2.5" style={{ background: p.theme.header }} />
                      <span className="h-5 w-2.5" style={{ background: p.theme.accent }} />
                    </span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Colours */}
            <div className="grid gap-3 sm:grid-cols-2">
              {COLOUR_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="block text-[12px] font-medium">{f.label}</span>
                  <span className="block text-[11px] text-[hsl(var(--ax-faint))]">{f.hint}</span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <input
                      type="color"
                      value={draft[f.key]}
                      onChange={(e) => setColour(f.key, e.target.value)}
                      aria-label={`${f.label} colour`}
                      className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-[hsl(var(--ax-border))] bg-transparent p-0.5"
                    />
                    <input
                      type="text"
                      value={typed[f.key]}
                      onChange={(e) => setColour(f.key, e.target.value)}
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-3 py-2 font-mono text-[12px] uppercase outline-none focus:border-[hsl(var(--ax-accent))]"
                    />
                  </span>
                </label>
              ))}
            </div>

            {/* Shell */}
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">
                Portal style <span className="normal-case tracking-normal">— Locker Room is the cinematic shell; same data, same permissions</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Portal style">
                {(
                  [
                    ["classic", "Classic"],
                    ["world", "Locker Room"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={draft.layout === value}
                    onClick={() => setDraft((d) => ({ ...d, layout: value }))}
                    className={`rounded-full border px-3.5 py-1.5 text-[12px] ${
                      draft.layout === value
                        ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-accent))]"
                        : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {draft.layout === "world" && (
                <input
                  type="text"
                  maxLength={32}
                  value={draft.brand}
                  onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
                  placeholder="World name — e.g. Mooney World"
                  className="mt-2 w-full rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
                />
              )}
            </div>

            {/* Title card */}
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">
                Title card <span className="normal-case tracking-normal">— top of their home page; leave the headline empty to hide it</span>
              </div>
              <div className="mt-2 grid gap-2">
                {(
                  [
                    ["eyebrow", "Small line above — e.g. SEASON 7"],
                    ["headline", "Headline — e.g. THE MOONEY ERA"],
                    ["subline", "One line under it"],
                  ] as const
                ).map(([field, placeholder]) => (
                  <input
                    key={field}
                    type="text"
                    maxLength={80}
                    value={draft.titleCard[field]}
                    onChange={(e) => setCard(field, e.target.value)}
                    placeholder={placeholder}
                    className="rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
                  />
                ))}
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="space-y-1">
                {warnings.map((w) => (
                  <p key={w} className="flex items-start gap-1.5 text-[12px] text-[hsl(var(--ax-amber))]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!dirty || save.isPending}
                onClick={() => submit(draft, `${entityName}'s portal updated`)}
                className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50"
              >
                {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save — {entityName} sees it on next load
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(saved);
                  setTyped({ ...saved });
                  setOpen(false);
                }}
                className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))]"
              >
                {dirty ? "Discard" : "Close"}
              </button>
              {custom && (
                <button
                  type="button"
                  disabled={save.isPending}
                  onClick={() => submit(DEFAULT_PORTAL_THEME, "Back to the standard AX look")}
                  className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to AX default
                </button>
              )}
            </div>
          </div>

          <ThemePreview theme={draft} name={entityName} />
        </div>
      )}
    </div>
  );
}

/**
 * A small phone-width mock of the portal top, in the draft's colours. Inline
 * styles only: setting the real CSS variables here would repaint V2.
 */
function ThemePreview({ theme, name }: { theme: PortalTheme; name: string }) {
  const onAccent = readableOn(theme.accent);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const card = theme.titleCard;
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">Preview</div>
      <div
        className="mt-2 overflow-hidden rounded-2xl border border-[hsl(var(--ax-border))]"
        style={{ background: theme.background }}
      >
        <div className="flex items-center gap-2.5 px-3.5 py-3" style={{ background: theme.header }}>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
            style={{ background: theme.accent, color: onAccent }}
          >
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold" style={{ color: theme.title }}>
              {name}
            </span>
            <span className="block text-[9px] uppercase tracking-[0.16em] text-white/50">Athlete · The Vault</span>
          </span>
          <span className="text-right">
            <span className="block text-[8px] uppercase tracking-[0.16em] text-white/50">Lifetime</span>
            <span className="block text-[14px] font-bold" style={{ color: theme.accent }}>
              $12,480
            </span>
          </span>
        </div>
        <div className="space-y-3 p-3.5">
          {card.headline ? (
            <div
              className="rounded-xl px-4 py-5"
              style={{
                background: `radial-gradient(120% 140% at 100% 0%, ${theme.accent}59 0%, transparent 55%), linear-gradient(160deg, ${theme.header} 0%, ${theme.background} 100%)`,
              }}
            >
              {card.eyebrow && (
                <div className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: theme.accent }}>
                  {card.eyebrow}
                </div>
              )}
              <div
                className="mt-1 break-words text-[22px] font-black uppercase leading-[0.95]"
                style={{ color: theme.title }}
              >
                {card.headline}
              </div>
              {card.subline && <div className="mt-1.5 text-[11px] text-white/60">{card.subline}</div>}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/15 px-4 py-4 text-center text-[11px] text-white/40">
              No title card
            </div>
          )}
          <div
            className="rounded-full py-2 text-center text-[12px] font-semibold"
            style={{ background: theme.accent, color: onAccent }}
          >
            Order merch
          </div>
        </div>
      </div>
    </div>
  );
}
