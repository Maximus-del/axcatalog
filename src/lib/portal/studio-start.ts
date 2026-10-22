// Creative Studio: one "Create new design" brief, with inspiration built in.
//
// The client tells us the idea, and can add inspiration two ways: upload
// screenshots / images, or paste links (Instagram, Pinterest, a site). Both
// go to AX on the same project (portal_create_project) — uploads as
// inspiration files, links in the details text where the AX team reads them.
//
// "From one of my designs" (remixing an existing design) comes later.

/** Pasted text → the http(s) links in it, one per line or space-separated, de-duplicated. */
export function parseLinks(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return Array.from(new Set(found.map((l) => l.replace(/[),.;]+$/, "")))).slice(0, 10);
}

/** Pure: the title and details text AX receives. The idea and vibes go as they are. */
export function briefFor(input: { kindLabel: string; idea: string; details: string; links?: string[] }): { title: string; details: string | null } {
  const idea = input.idea.trim();
  const short = idea.slice(0, 60) + (idea.length > 60 ? "…" : "");
  const lines: string[] = [];
  if (input.links?.length) lines.push(`Inspiration links: ${input.links.join(" ")}`);
  if (input.details.trim()) lines.push(input.details.trim());
  return { title: `${input.kindLabel}: ${short}`.slice(0, 140), details: lines.length ? lines.join("\n") : null };
}

/** What has to be there before a brief can be sent, as a sentence, or null when it is ready. */
export function briefProblem(input: { idea: string }): string | null {
  return input.idea.trim() ? null : "Tell us your idea first.";
}
