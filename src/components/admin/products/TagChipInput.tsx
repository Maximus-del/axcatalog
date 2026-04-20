import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** When true, autocomplete pulls from tags / athletes / teams / collections. */
  withSuggestions?: boolean;
}

interface Suggestion {
  value: string;
  label: string;
  /** Marks the synthetic "Create new tag: X" row. */
  isCreate?: boolean;
}

export function TagChipInput({ tags, onChange, placeholder, withSuggestions = true }: Props) {
  const [draft, setDraft] = useState("");
  const [matches, setMatches] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!withSuggestions) return;
    const q = draft.trim().toLowerCase();
    if (q.length < 1) {
      setMatches([]);
      return;
    }
    let cancel = false;
    (async () => {
      // Run in parallel; ignore prefix if user typed athlete:foo etc.
      const bare = q.replace(/^(athlete|team|collection):/i, "");
      const [tagsRes, athletesRes, teamsRes, collectionsRes] = await Promise.all([
        supabase.from("tags").select("name").ilike("name", `%${bare}%`).limit(5),
        supabase.from("athletes").select("slug, full_name, first_name, last_name").ilike("slug", `%${bare}%`).limit(5),
        supabase.from("teams").select("slug, name").ilike("slug", `%${bare}%`).limit(5),
        supabase.from("collections").select("slug, name").ilike("slug", `%${bare}%`).limit(5),
      ]);
      if (cancel) return;
      const out: Suggestion[] = [];
      (athletesRes.data ?? []).forEach((a) =>
        out.push({
          value: `athlete:${a.slug}`,
          label: `athlete:${a.slug} — ${a.full_name ?? `${a.first_name} ${a.last_name}`}`,
        }),
      );
      (teamsRes.data ?? []).forEach((t) =>
        out.push({ value: `team:${t.slug}`, label: `team:${t.slug} — ${t.name}` }),
      );
      (collectionsRes.data ?? []).forEach((c) =>
        out.push({ value: `collection:${c.slug}`, label: `collection:${c.slug} — ${c.name}` }),
      );
      (tagsRes.data ?? []).forEach((t) => out.push({ value: t.name, label: t.name }));
      setMatches(out.slice(0, 8));
      setHighlight(0);
    })();
    return () => {
      cancel = true;
    };
  }, [draft, withSuggestions]);

  // Final list = matches + a "Create new" row when nothing matches the literal text.
  const suggestions = useMemo<Suggestion[]>(() => {
    const q = draft.trim();
    if (!q) return matches;
    const exists = matches.some((m) => m.value.toLowerCase() === q.toLowerCase());
    if (exists) return matches;
    return [
      ...matches,
      { value: q, label: `Create new tag: "${q}"`, isCreate: true },
    ];
  }, [matches, draft]);

  // Close suggestions on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function commit(value: string) {
    const v = value.trim();
    if (!v) return;
    if (tags.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...tags, v]);
    setDraft("");
    setMatches([]);
    setHighlight(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      if (!open || suggestions.length === 0) return;
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      if (!open || suggestions.length === 0) return;
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === "Tab" && open && suggestions.length > 0 && draft.trim()) {
      // Tab autocompletes the highlighted suggestion (don't lose focus).
      e.preventDefault();
      commit(suggestions[highlight]?.value ?? draft);
      return;
    }
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      // If suggestions are open, commit the highlighted one (lets user pick
      // a slug-correct suggestion instead of their typo). Otherwise commit raw.
      if (open && suggestions.length > 0) {
        commit(suggestions[highlight]?.value ?? draft);
      } else {
        commit(draft);
      }
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex flex-wrap items-center gap-1.5 min-h-10 px-2 py-1.5 rounded-md border border-input bg-background">
        {tags.map((t) => (
          <span
            key={t}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border",
              t.startsWith("athlete:") && "bg-blue-500/15 text-blue-300 border-blue-500/30",
              t.startsWith("team:") && "bg-purple-500/15 text-purple-300 border-purple-500/30",
              t.startsWith("collection:") && "bg-muted text-muted-foreground border-border",
              !/^(athlete|team|collection):/.test(t) && "bg-accent/15 text-accent border-accent/30",
            )}
          >
            {t}
            <button
              type="button"
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="hover:opacity-70"
              aria-label={`Remove ${t}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Commit unfinished draft on blur so the user doesn't lose it.
            if (draft.trim()) commit(draft);
          }}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] h-7 border-0 bg-transparent px-1 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-[60] left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden max-h-72 overflow-y-auto scroll-touch">
          {suggestions.map((s, i) => (
            <button
              key={s.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(s.value);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "block w-full text-left px-3 py-2 text-sm transition-colors",
                i === highlight ? "bg-accent/15 text-accent" : "text-foreground hover:bg-accent/10",
                s.isCreate && "border-t border-border italic",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
