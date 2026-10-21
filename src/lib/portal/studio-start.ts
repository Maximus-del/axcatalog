// Creative Studio: three ways in, one brief.
//
//   fresh   — "Create new design": the idea comes first.
//   remix   — "From one of my designs": pick a design AX already made for
//             them (or upload their own file), then say what should change.
//   inspire — "From inspiration": a style they saw somewhere — screenshots,
//             files or links — then say what they like about it.
//
// All three send the same project to AX (portal_create_project), so nothing
// new is needed on the server. What makes them different travels in the
// brief itself: the title says how it started, and the details carry the
// chosen design and any links, where the AX team reads them.

export type StudioStart = "fresh" | "remix" | "inspire";

export interface StartCopy {
  key: StudioStart;
  title: string;
  blurb: string;
  /** Title prefix on the project AX receives. */
  tag: string;
  ideaLabel: string;
  ideaPlaceholder: string;
  uploadLabel: string;
  /** Show the drop zone above the idea (remix / inspire start from the picture). */
  uploadFirst: boolean;
}

export const STARTS: StartCopy[] = [
  {
    key: "fresh",
    title: "Create new design",
    blurb: "Start from an idea. We'll take it from there.",
    tag: "New design",
    ideaLabel: "Tell us your idea",
    ideaPlaceholder: "Describe what you want to make…",
    uploadLabel: "Add inspiration (optional)",
    uploadFirst: false,
  },
  {
    key: "remix",
    title: "From one of my designs",
    blurb: "Take a design you already have and make a new version of it.",
    tag: "Remix",
    ideaLabel: "What should change?",
    ideaPlaceholder: "New colourway, swap the text, make it a hoodie, add the year…",
    uploadLabel: "Or upload the design file",
    uploadFirst: true,
  },
  {
    key: "inspire",
    title: "From inspiration",
    blurb: "Saw a style you love? Show us and we'll make it yours.",
    tag: "Inspired by",
    ideaLabel: "What do you like about it?",
    ideaPlaceholder: "The font, the layout, the colours, the vintage feel…",
    uploadLabel: "Upload screenshots or images",
    uploadFirst: true,
  },
];

export const startCopy = (key: StudioStart): StartCopy => STARTS.find((s) => s.key === key) ?? STARTS[0];

/** Pasted text → the http(s) links in it, one per line or space-separated, de-duplicated. */
export function parseLinks(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return Array.from(new Set(found.map((l) => l.replace(/[),.;]+$/, "")))).slice(0, 10);
}

/**
 * Pure: what the brief needs to say about how it started, for the AX team.
 * Returns the title and the details text; the idea and vibes go as they are.
 */
export function briefFor(input: {
  start: StudioStart;
  kindLabel: string;
  idea: string;
  details: string;
  design?: { title: string; designNumber: string | null } | null;
  links?: string[];
}): { title: string; details: string | null } {
  const copy = startCopy(input.start);
  const idea = input.idea.trim();
  const short = idea.slice(0, 60) + (idea.length > 60 ? "…" : "");
  const lead =
    input.start === "remix" && input.design
      ? `${copy.tag} ${input.design.designNumber ? `#${input.design.designNumber} ` : ""}${input.design.title}`
      : input.start === "fresh"
        ? input.kindLabel
        : `${copy.tag} · ${input.kindLabel}`;
  const lines: string[] = [];
  if (input.start === "remix" && input.design)
    lines.push(`Starting from: ${input.design.title}${input.design.designNumber ? ` (#${input.design.designNumber})` : ""}`);
  if (input.start === "inspire") lines.push("Started from inspiration — match the style, make it ours.");
  if (input.links?.length) lines.push(`Links: ${input.links.join(" ")}`);
  if (input.details.trim()) lines.push(input.details.trim());
  return { title: `${lead}: ${short}`.slice(0, 140), details: lines.length ? lines.join("\n") : null };
}

/** What has to be there before a brief can be sent, as a sentence, or null when it is ready. */
export function briefProblem(input: {
  start: StudioStart;
  idea: string;
  hasDesign: boolean;
  uploads: number;
  links: number;
}): string | null {
  if (input.start === "remix" && !input.hasDesign && input.uploads === 0) return "Pick one of your designs or upload the file.";
  if (input.start === "inspire" && input.uploads === 0 && input.links === 0) return "Add a screenshot, image or link first.";
  if (!input.idea.trim()) return input.start === "fresh" ? "Tell us your idea first." : `${startCopy(input.start).ideaLabel.replace(/\?$/, "")} — a line is enough.`;
  return null;
}
