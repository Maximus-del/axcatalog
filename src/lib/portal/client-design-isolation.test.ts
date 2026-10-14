import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The client portal may not reach into the design tables, and may not name the
 * production bucket.
 *
 * `public.client_design_shelf` exists because its return type has nowhere to put
 * a `design-files` location. That guarantee is only worth something if the
 * portal actually walks through that door. It did not: usePortalDesigns joined
 * design_athletes -> designs -> design_files and passed the bucket named in the
 * row straight to createSignedUrl, so the visibility ceiling was never applied
 * and the bucket was attacker-chosen in the sense that it came from data rather
 * than from code. Nothing leaked, because every account was an admin — but the
 * first client login would have been handed production artwork.
 *
 * This test is source-level on purpose: the failure it guards against is
 * somebody adding a convenient query, not a runtime branch going wrong.
 */

const SRC = join(process.cwd(), "src");

/** Every directory that renders for a client session. */
const CLIENT_DIRS = [
  join(SRC, "components", "portal"),
  join(SRC, "pages", "portal"),
  join(SRC, "lib", "portal"),
];

/** Portal hooks live alongside operator hooks, so they are matched by name. */
const CLIENT_HOOK_PREFIXES = ["usePortal", "useCurrentAthlete", "useClientMockups", "useAthleteCredit"];

/** Reads that are allowed, each with the reason it is safe. */
const EXEMPT: Record<string, string> = {
  "hooks/usePortalStats.ts":
    "counts design_athletes rows only — selects no file path and no bucket, so nothing signable leaves the query",
};

const FORBIDDEN_TABLES = ["designs", "design_files"] as const;
const PRODUCTION_BUCKET = "design-files";

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function clientHookFiles(): string[] {
  const dir = join(SRC, "hooks");
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n))
    .filter((n) => CLIENT_HOOK_PREFIXES.some((p) => n.startsWith(p)))
    .map((n) => join(dir, n));
}

function stripComments(source: string): string {
  return source
    .split("\n")
    .map((line) => (line.trim().startsWith("//") || line.trim().startsWith("*") ? "" : line))
    .join("\n");
}

function clientFiles(): string[] {
  const files = [...CLIENT_DIRS.flatMap((d) => walk(d)), ...clientHookFiles()];
  return files.filter((f) => !(relative(SRC, f).replace(/\\/g, "/") in EXEMPT));
}

describe("client design isolation", () => {
  it("finds the portal source to check", () => {
    expect(clientFiles().length).toBeGreaterThan(20);
  });

  it("no client-facing file queries the design tables directly", () => {
    const offenders: string[] = [];
    for (const file of clientFiles()) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const table of FORBIDDEN_TABLES) {
        if (source.includes(`from("${table}")`) || source.includes(`from('${table}')`)) {
          offenders.push(`${relative(SRC, file)} queries ${table}`);
        }
      }
    }
    expect(
      offenders,
      `Client surfaces must read designs through client_design_shelf, which cannot emit a production path.\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("no client-facing file names the production bucket", () => {
    const offenders: string[] = [];
    for (const file of clientFiles()) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (source.includes(PRODUCTION_BUCKET)) {
        offenders.push(relative(SRC, file));
      }
    }
    expect(
      offenders,
      `'${PRODUCTION_BUCKET}' holds print-ready artwork and no client policy grants it.\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("usePortalDesigns calls the sanctioned RPC", () => {
    const source = readFileSync(join(SRC, "hooks", "usePortalDesigns.ts"), "utf8");
    expect(source).toContain("client_design_shelf");
  });

  it("exemptions carry a stated reason", () => {
    for (const [path, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, `${path} needs a reason`).toBeGreaterThan(20);
    }
  });
});
