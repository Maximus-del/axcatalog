// Parse a freeform tag like "athlete:darnell-mooney" or "premium" into a
// structured form so the apply step knows where to write.
export type ParsedTag =
  | { kind: "athlete"; slug: string; raw: string }
  | { kind: "team"; slug: string; raw: string }
  | { kind: "collection"; slug: string; raw: string }
  | { kind: "freeform"; name: string; raw: string };

export function parseTag(input: string): ParsedTag | null {
  const raw = input.trim();
  if (!raw) return null;
  const m = raw.match(/^(athlete|team|collection)\s*:\s*(.+)$/i);
  if (m) {
    const kind = m[1].toLowerCase() as "athlete" | "team" | "collection";
    const slug = m[2].trim().toLowerCase().replace(/\s+/g, "-");
    if (!slug) return null;
    return { kind, slug, raw };
  }
  return { kind: "freeform", name: raw, raw };
}
