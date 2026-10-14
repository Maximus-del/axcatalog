import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A V2 SCREEN NEVER REPLACES ITSELF WITH A V1 SCREEN.
 *
 * V1 and V2 are two interfaces over ONE database — V2 deliberately reuses
 * V1's tables rather than duplicating the backend, so the records really are
 * the same records. That was never the problem. The problem was navigation:
 * clicking a product in V2 handed you to V1's editor, in the same tab, with no
 * way back to the mockup you came from, and it felt like the dashboard leaked.
 *
 * So a `<Link to="/admin/...">` inside admin-v2 is a bug. React Router's Link
 * navigates in place. Deliberate hops go through <V1Link>, or a plain anchor
 * with target="_blank" — labelled, in a new tab, chosen.
 *
 * As V2 grows its own screens these disappear one at a time. This test is what
 * stops new ones arriving.
 */

const ROOTS = [join(process.cwd(), "src", "pages", "admin-v2"), join(process.cwd(), "src", "components", "admin-v2")];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx") && !name.includes(".test.")) out.push(full);
  }
  return out;
}

interface Leak {
  file: string;
  line: number;
  snippet: string;
}

/** `<Link to="/admin/…">` — in-place navigation out of V2. */
function routerLinksToV1(): Leak[] {
  const leaks: Leak[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const source = readFileSync(file, "utf8");
      let at = source.indexOf("<Link");
      while (at !== -1) {
        // Read to the end of the opening tag, respecting {} in attributes.
        let depth = 0;
        let i = at + 5;
        while (i < source.length) {
          const ch = source[i];
          if (ch === "{") depth += 1;
          else if (ch === "}") depth -= 1;
          else if (ch === ">" && depth === 0) break;
          i += 1;
        }
        const attrs = source.slice(at, i);
        if (/\bto=\{?["`]?\/admin\//.test(attrs) && !attrs.includes("/admin-v2")) {
          leaks.push({
            file: file.slice(process.cwd().length + 5).replace(/\\/g, "/"),
            line: source.slice(0, at).split("\n").length,
            snippet: attrs.replace(/\s+/g, " ").slice(0, 90),
          });
        }
        at = source.indexOf("<Link", at + 1);
      }
    }
  }
  return leaks;
}

/** A bare <a href="/admin/…"> with no target — same-tab navigation, same bug. */
function anchorsToV1(): Leak[] {
  const leaks: Leak[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const source = readFileSync(file, "utf8");
      let at = source.indexOf("<a");
      while (at !== -1) {
        const close = source.indexOf(">", at);
        const attrs = source.slice(at, close === -1 ? source.length : close);
        const toV1 = /\bhref=\{?["`]?\/admin\//.test(attrs) && !attrs.includes("/admin-v2");
        if (toV1 && !attrs.includes("target=")) {
          leaks.push({
            file: file.slice(process.cwd().length + 5).replace(/\\/g, "/"),
            line: source.slice(0, at).split("\n").length,
            snippet: attrs.replace(/\s+/g, " ").slice(0, 90),
          });
        }
        at = source.indexOf("<a", at + 1);
      }
    }
  }
  return leaks;
}

describe("V2 does not navigate into V1", () => {
  it("has no react-router Link pointing at a V1 route", () => {
    const leaks = routerLinksToV1();
    expect(
      leaks.map((l) => `${l.file}:${l.line} ${l.snippet}`),
      "A <Link to=\"/admin/…\"> navigates in place and drops the operator out of " +
        "V2. Use <V1Link to={…}> — it opens V1 in a new tab and labels itself — " +
        "or route to a V2 screen if one now exists.",
    ).toEqual([]);
  });

  it("has no same-tab anchor pointing at a V1 route", () => {
    const leaks = anchorsToV1();
    expect(
      leaks.map((l) => `${l.file}:${l.line} ${l.snippet}`),
      'An <a href="/admin/…"> without target="_blank" is the same bug written a ' +
        "different way. Add target=\"_blank\" rel=\"noreferrer\", or use <V1Link>.",
    ).toEqual([]);
  });

  it("is actually looking at the V2 source", () => {
    // A refactor that moves these folders would otherwise make the whole file
    // pass by finding nothing to check.
    const files = ROOTS.flatMap((r) => walk(r));
    expect(files.length).toBeGreaterThan(15);
  });
});
