import { useEffect, useRef, useState } from "react";
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
}

export function TagChipInput({ tags, onChange, placeholder, withSuggestions = true }: Props) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!withSuggestions) return;
    const q = draft.trim().toLowerCase();
    if (q.length < 1) {
      setSuggestions([]);
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
      setSuggestions(out.slice(0, 8));
    })();
    return () => {
      cancel = true;
    };
  }, [draft, withSuggestions]);

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
    setSuggestions([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
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
              t.startsWith("athlete:") && "bg-accent/15 text-accent border-accent/30",
              t.startsWith("team:") && "bg-secondary text-secondary-foreground border-border",
              t.startsWith("collection:") && "bg-primary/15 text-primary border-primary/30",
              !/^(athlete|team|collection):/.test(t) && "bg-muted text-foreground border-border",
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
        <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(s.value);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent/10 hover:text-accent"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
