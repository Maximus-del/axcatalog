import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every table the portal reads must have a client policy behind it.
 *
 * Until 2026-10-15 the catalog and design tables carried a single policy each:
 * a bare `is_org_accessible(organization_id)`, which is an organisation match
 * and nothing else. A client login is filed into the athlete's organisation, so
 * the first client password would have been able to run
 *
 *   GET    /rest/v1/designs?select=*
 *   DELETE /rest/v1/designs?id=eq....
 *
 * and reach every design, mockup and product in the org, hidden or not. The
 * portal UI showed none of it; PostgREST does not consult the UI.
 *
 * That is now split: those policies require `current_user_is_operator()`, and
 * the tables the portal genuinely reads got narrow client policies scoped
 * through user_athlete_links. Which leaves a new way to break it — adding a
 * `.from("...")` to portal code for a table that has no client policy. The
 * query returns an empty array rather than an error, so it looks like missing
 * data, not a permissions bug, and the obvious fix is to widen the policy.
 *
 * ALLOWED below is the client's half of the contract, written down. A portal
 * read of anything else fails here, at the point where the cheap answer is
 * still available: route it through a SECURITY DEFINER function that applies
 * the visibility rule itself, the way client_design_shelf() does.
 *
 * Source-level on purpose. What this guards against is somebody adding a
 * convenient query, not a runtime branch going wrong.
 */

const SRC = join(process.cwd(), "src");

const CLIENT_DIRS = [
  join(SRC, "components", "portal"),
  join(SRC, "pages", "portal"),
  join(SRC, "lib", "portal"),
];

const CLIENT_HOOK_PREFIXES = [
  "usePortal",
  "useCurrentAthlete",
  "useClientMockups",
  "useAthleteCredit",
  "usePublicCatalog",
  "useSaved",
];

/**
 * Tables a client login may read, and the policy that lets them.
 *
 * Each value names the live policy, so a failure here can be checked against
 * the database rather than guessed at.
 */
const ALLOWED: Record<string, string> = {
  // Added 2026-10-15 alongside the operator gate.
  athletes: "client reads own athlete — id in viewer_athlete_ids()",
  // Added 2026-10-22 with portal invites: a person reads only their own request (their saved answers).
  portal_access_requests: "requester reads own access requests — user_id = auth.uid()",
  teams: "client reads own teams — id in viewer_team_ids()",
  team_memberships: "client reads own memberships — athlete_id in viewer_athlete_ids()",
  products: "client reads own products — id in viewer_product_ids()",
  product_athletes: "client reads own product athletes — athlete_id in viewer_athlete_ids()",
  product_variants: "client reads own product variants — product_id in viewer_product_ids()",
  collections: "client reads own collections — id in viewer_collection_ids()",
  product_collections: "client reads own product collections — product_id in viewer_product_ids()",
  // Added 2026-10-15 (collections fix, run by hand): the table the app actually writes.
  collection_products:
    "client reads own collection products — collection_id in viewer_collection_ids() AND product_id in viewer_product_ids()",
  // Added 2026-10-15 (portal stage 1). Read today only as an embedded select
  // from usePortalProducts, which this regex does not see; listed so a direct
  // read is already accounted for.
  product_images: "client reads own product images — product_id in viewer_product_ids()",
  blanks: "client reads sellable blanks — viewer_blank_ids() excludes internal_only",
  blank_sizes: "client reads sellable blank sizes — blank_id in viewer_blank_ids()",
  blank_colors: "client reads sellable blank colors — blank_id in viewer_blank_ids()",
  org_pricing_config: "client reads own pricing config — organization_id = current_user_org_id()",
  volume_discount_tiers: "client reads own tiers — organization_id = current_user_org_id()",
  design_athletes: "client reads own design links — athlete_id in viewer_athlete_ids()",

  // Already viewer-scoped before the gate; these are the tables the portal was
  // built with, and they were written correctly from the start.
  portal_threads: "pre-existing viewer-scoped policy via user_athlete_links",
  portal_messages: "pre-existing viewer-scoped policy via user_athlete_links",
  portal_hidden_products: "pre-existing viewer-scoped policy via user_athlete_links",
  bulk_order_requests: "pre-existing viewer-scoped policy via user_athlete_links",
  bulk_order_items: "pre-existing viewer-scoped policy via user_athlete_links",
  saved_items: "pre-existing policy scoped to auth.uid()",
  athlete_follows: "pre-existing policy scoped to auth.uid()",
  fan_profiles: "pre-existing policy scoped to auth.uid()",
  athlete_credit_wallets: "pre-existing viewer-scoped policy",
  athlete_credit_transactions: "pre-existing viewer-scoped policy",
  affiliates: "pre-existing viewer-scoped policy",
  order_line_items: "pre-existing viewer-scoped policy via product_athletes",
  orders: "athlete read parent orders — scoped via product_athletes",
  organizations: "pre-existing admin-gated and self policies",
  user_profiles: "Users see profiles in own org — keeps a self-read on auth.uid()",
  volume_discount_breaks: "pre-existing admin-gated policy; breaks hang off a readable tier",

  // Owner-rights views. These bypass RLS by design and expose only published
  // catalog rows, which is the point of having them.
  public_catalog: "owner-rights view; no RLS to satisfy",
  public_catalog_sizes: "owner-rights view; no RLS to satisfy",
  public_catalog_colors: "owner-rights view; no RLS to satisfy",
  client_mockups: "view over mockups applying the client visibility rule",
};

/**
 * Tables that are operator-only on purpose, with the door a client uses
 * instead. Listed separately from "not allowed" so the message can say where
 * to go rather than only what is refused.
 */
const USE_INSTEAD: Record<string, string> = {
  designs: "client_design_shelf(_athlete_id) — a SECURITY DEFINER RPC that applies design_client_visible()",
  design_files: "client_design_shelf(), which cannot return a design-files path",
  mockups: "the client_mockups view",
  tasks: "nothing — tasks are operator-only",
  size_distribution_curves: "compute_wholesale_price(), which reads the curves itself",
};

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
  let entries: string[];
  try {
    entries = readdirSync(join(SRC, "hooks"));
  } catch {
    return [];
  }
  return entries
    .filter((n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n))
    .filter((n) => CLIENT_HOOK_PREFIXES.some((p) => n.startsWith(p)))
    .map((n) => join(SRC, "hooks", n));
}

function stripComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const t = line.trim();
      return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : line;
    })
    .join("\n");
}

function clientFiles(): string[] {
  return [...CLIENT_DIRS.flatMap((d) => walk(d)), ...clientHookFiles()];
}

interface Read {
  table: string;
  file: string;
}

/**
 * `supabase.storage.from("mockups")` names a storage bucket, not a table, and
 * buckets have their own policies — the design-files one is guarded by
 * client-design-isolation.test.ts. Capturing the receiver is what tells the two
 * apart, since both spell it `.from("...")`.
 *
 * The table name is read without requiring the closing paren, because a V2 read
 * may carry a cast: `.from("client_mockups" as never)`.
 */
function portalReads(): Read[] {
  const reads: Read[] = [];
  const pattern = /([A-Za-z_$][\w$]*)\s*\.\s*from\(\s*["'`]([a-zA-Z_][a-zA-Z0-9_]*)["'`]/g;
  for (const file of clientFiles()) {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const m of source.matchAll(pattern)) {
      if (m[1] === "storage") continue;
      reads.push({ table: m[2], file: relative(SRC, file).replace(/\\/g, "/") });
    }
  }
  return reads;
}

describe("portal read allowlist", () => {
  it("finds the portal source to check", () => {
    expect(clientFiles().length).toBeGreaterThan(20);
    expect(portalReads().length).toBeGreaterThan(10);
  });

  it("every table the portal reads has a client policy behind it", () => {
    const offenders = portalReads()
      .filter((r) => !(r.table in ALLOWED))
      .map((r) => {
        const alt = USE_INSTEAD[r.table];
        return alt
          ? `${r.file} reads ${r.table}, which is operator-only — use ${alt}`
          : `${r.file} reads ${r.table}, which has no client policy. Add one scoped through user_athlete_links, or read it through a SECURITY DEFINER function.`;
      });
    expect(
      offenders,
      `A client login gets an empty array from these, not an error, so the bug looks like missing data.\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("no portal file reads a table that is operator-only on purpose", () => {
    const names = new Set(portalReads().map((r) => r.table));
    for (const table of Object.keys(USE_INSTEAD)) {
      expect(names.has(table), `${table} is operator-only — use ${USE_INSTEAD[table]}`).toBe(false);
    }
  });

  it("the two lists do not disagree with each other", () => {
    for (const table of Object.keys(USE_INSTEAD)) {
      expect(table in ALLOWED, `${table} cannot be both allowed and operator-only`).toBe(false);
    }
  });

  it("every allowance names the policy that grants it", () => {
    for (const [table, why] of Object.entries(ALLOWED)) {
      expect(why.length, `${table} needs a stated policy`).toBeGreaterThan(20);
    }
  });
});
