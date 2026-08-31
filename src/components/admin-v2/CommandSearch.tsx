import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Search, X } from "lucide-react";
import { SEARCH_KIND_LABEL, useV2Search, type SearchHit } from "@/lib/v2/data";

// ONE SEARCH BOX FOR THE WHOLE OF V2.
//
// Finding a person meant People → type. Finding a mockup meant remembering
// whose it was first. Finding a blank meant Commerce → Blank catalog → type.
// Three different navigations for one question that is always the same shape:
// where is the thing called X.
//
// Opens on ⌘K / Ctrl+K, or by clicking the field in the header. Arrow keys
// move, Enter opens, Escape closes — because the operator who uses this most
// is the one who never takes their hands off the keyboard.

const DEBOUNCE_MS = 180;

export default function CommandSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const ready = debounced.trim().length >= 2;
  const { data, isFetching } = useV2Search(debounced);
  // Belt and braces: the hook is disabled below two characters, so this only
  // matters if a cached result outlives the term that produced it.
  const hits = useMemo(() => (ready ? (data ?? []) : []), [data, ready]);

  /* ------------------------------------------------------------- opening */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setTerm("");
      setDebounced("");
      setCursor(0);
    }
  }, [open]);

  // Typing should not fire a query per keystroke; the operator is mid-word for
  // most of them.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [term]);

  useEffect(() => setCursor(0), [debounced]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    navigate(hit.to);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(hits.length - 1, 0)));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (e.key === "Enter" && hits[cursor]) {
      e.preventDefault();
      go(hits[cursor]);
    }
  };

  /* -------------------------------------------------------------- render */

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Search AX (⌘K)"
        aria-label="Search"
        className="flex shrink-0 items-center gap-2 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-faint))] transition-colors hover:text-[hsl(var(--ax-ink))]"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-[hsl(var(--ax-border))] px-1 text-[10px] lg:inline">⌘K</kbd>
      </button>
    );
  }

  // Grouped in a fixed order so the list does not reshuffle as you type.
  const groups = hits.reduce<Array<{ kind: SearchHit["kind"]; hits: SearchHit[] }>>((acc, hit) => {
    const last = acc[acc.length - 1];
    if (last && last.kind === hit.kind) last.hits.push(hit);
    else acc.push({ kind: hit.kind, hits: [hit] });
    return acc;
  }, []);

  let index = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      <button type="button" aria-label="Close search" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/70" />
      <div className="admin-os relative mx-4 w-full max-w-xl overflow-hidden rounded-2xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-canvas))] text-[hsl(var(--ax-ink))] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[hsl(var(--ax-line))] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[hsl(var(--ax-faint))]" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search people, mockups, designs, blanks, collections, products…"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[hsl(var(--ax-faint))]"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-lg p-1 text-[hsl(var(--ax-faint))] hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto scroll-touch">
          {term.trim().length < 2 && (
            <p className="px-4 py-6 text-center text-[12px] text-[hsl(var(--ax-faint))]">
              Two characters is enough. Arrow keys move, Enter opens.
            </p>
          )}

          {term.trim().length >= 2 && isFetching && hits.length === 0 && (
            <p className="px-4 py-6 text-center text-[12px] text-[hsl(var(--ax-faint))]">Searching…</p>
          )}

          {term.trim().length >= 2 && !isFetching && hits.length === 0 && (
            <p className="px-4 py-6 text-center text-[12px] text-[hsl(var(--ax-faint))]">
              Nothing called “{term.trim()}”.
            </p>
          )}

          {groups.map((group) => (
            <div key={group.kind}>
              <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--ax-secondary))]">
                {SEARCH_KIND_LABEL[group.kind]}
              </div>
              {group.hits.map((hit) => {
                index += 1;
                const active = index === cursor;
                const at = index;
                return (
                  <button
                    key={`${hit.kind}-${hit.id}`}
                    type="button"
                    onMouseEnter={() => setCursor(at)}
                    onClick={() => go(hit)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                      active ? "bg-[hsl(var(--ax-accent)/0.14)]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{hit.label}</span>
                      {hit.detail && (
                        <span className="block truncate text-[11px] text-[hsl(var(--ax-faint))]">{hit.detail}</span>
                      )}
                    </span>
                    {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-accent))]" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
