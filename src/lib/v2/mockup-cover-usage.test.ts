import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY MOCKUP SHOWS ITS COMPOSITE, NOT THE BARE BLANK.
 *
 * A mockup row carries two pictures: `imageUrl` is the BLANK's photograph and
 * `storage_bucket`/`storage_path` is the composite — that garment with the
 * artwork flattened onto it. AssetImage prefers a `url` and only signs the
 * bucket/path pair when no url is given, so any caller that helpfully passes
 * all three gets the empty garment and never reaches for the composite.
 *
 * That happened on six surfaces at once — the library shelf, folder covers,
 * Creative's rails, the athlete overview, the AX overview, blank detail — and
 * was fixed one screen at a time, twice, because nothing stopped it coming
 * back. mockupCover() is the single answer; this test is what keeps it single.
 *
 * A PRODUCT legitimately passes both: its imageUrl is its own picture and the
 * bucket is only a fallback from the concept it came from. Those opt out with
 * a `cover-source:` comment that says which object it is and why.
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx") && !name.includes(".test.")) out.push(full);
  }
  return out;
}

interface Site {
  file: string;
  line: number;
  block: string;
  exempt: boolean;
}

function assetImageSites(): Site[] {
  const sites: Site[] = [];
  for (const file of walk(SRC)) {
    const source = readFileSync(file, "utf8");
    let at = source.indexOf("<AssetImage");
    while (at !== -1) {
      const close = source.indexOf("/>", at);
      const block = source.slice(at, close === -1 ? source.length : close);
      // The opt-out has to sit immediately above the element, so it describes
      // this one rather than drifting in from somewhere else in the file.
      const preamble = source.slice(Math.max(0, at - 400), at);
      sites.push({
        file: file.slice(SRC.length + 1).replace(/\\/g, "/"),
        line: source.slice(0, at).split("\n").length,
        block,
        exempt: preamble.includes("cover-source:"),
      });
      at = source.indexOf("<AssetImage", at + 1);
    }
  }
  return sites;
}

describe("nothing renders a mockup as its bare blank", () => {
  const sites = assetImageSites();

  it("finds the AssetImage calls it is guarding", () => {
    expect(sites.length).toBeGreaterThan(8);
  });

  it.each(sites.map((s) => [`${s.file}:${s.line}`, s] as const))(
    "%s does not pass url and bucket together",
    (id, site) => {
      if (site.exempt) return;
      const passesUrl = /\burl=\{[^}]*\.imageUrl/.test(site.block);
      const passesBucket = /\bbucket=\{[^}]*\.imageBucket/.test(site.block);
      expect(
        passesUrl && passesBucket,
        `${id} passes both url={…imageUrl} and bucket={…imageBucket}. AssetImage ` +
          `prefers the url, so a mockup rendered this way shows the bare garment ` +
          `and never its composite. Spread {...mockupCover(x)} instead — or, if ` +
          `this really is a product, add a "cover-source:" comment above it ` +
          `saying so.`,
      ).toBe(false);
    },
  );
});
