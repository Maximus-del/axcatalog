import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DRAFT_STATUS, ORDER_STATUSES, OPEN_STATUSES, STATUS_LABEL } from "./order-status";

/**
 * A `draft` bulk_order_request is an OPERATOR'S WORKING CART, not an order.
 * It lives on the same table so V2 can reuse the line-item model and the
 * total_units trigger — which means every read that means "orders" has to say
 * so. RLS already hides drafts from client sessions; operator sessions see
 * everything, so the application query is the only guard on the admin side.
 *
 * This test walks the source and fails when a NEW read of the table appears
 * without a status constraint. It is deliberately source-level: the failure it
 * exists to catch is somebody adding a query, not a runtime branch.
 */

const SRC = join(process.cwd(), "src");
const TABLE = 'from("bulk_order_requests")';

/** Reads that legitimately need no status filter, each with its reason. */
const EXEMPT: Record<string, string> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Whole-line comments are dropped first: a semicolon inside one would
 * otherwise cut a chain short and hide the filter that follows it.
 */
function stripComments(source: string): string {
  return source
    .split("\n")
    .map((line) => (line.trim().startsWith("//") ? "" : line))
    .join("\n");
}

/** The chained call that starts at `from("bulk_order_requests")`. */
function chainAt(source: string, index: number): string {
  const end = source.indexOf(";", index);
  return source.slice(index, end === -1 ? source.length : end);
}

interface Site {
  file: string;
  line: number;
  chain: string;
}

function readSites(): Site[] {
  const sites: Site[] = [];
  for (const file of walk(SRC)) {
    if (file.endsWith("types.ts")) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    let at = source.indexOf(TABLE);
    while (at !== -1) {
      const chain = chainAt(source, at);
      // Writes carry their own status explicitly, or are keyed by an id that
      // a filtered read produced. Only reads can leak a draft into a list.
      const isRead = /\.select\(/.test(chain) && !/\.(insert|update|upsert|delete)\(/.test(chain);
      if (isRead) {
        sites.push({
          file: file.slice(SRC.length + 1).replace(/\\/g, "/"),
          line: source.slice(0, at).split("\n").length,
          chain,
        });
      }
      at = source.indexOf(TABLE, at + TABLE.length);
    }
  }
  return sites;
}

function constrainsStatus(chain: string): boolean {
  return /\.(eq|in|neq)\(\s*"status"/.test(chain);
}

describe("draft bulk orders stay out of the order surfaces", () => {
  const sites = readSites();

  it("finds the reads it is supposed to be guarding", () => {
    // A refactor that renames the table or the client would otherwise make
    // this whole file pass by finding nothing.
    expect(sites.length).toBeGreaterThan(8);
  });

  it.each(sites.map((s) => [`${s.file}:${s.line}`, s] as const))(
    "%s constrains status",
    (id, site) => {
      if (EXEMPT[site.file]) return;
      expect(
        constrainsStatus(site.chain),
        `${id} reads bulk_order_requests without a status filter, so an ` +
          `operator's draft cart would appear there as an order. Add ` +
          `.neq("status", DRAFT_STATUS), or an explicit .eq/.in of the ` +
          `statuses the surface means.`,
      ).toBe(true);
    },
  );
});

describe("draft is a cart, not a lifecycle stage", () => {
  it("is absent from the admin status lists", () => {
    expect(ORDER_STATUSES).not.toContain(DRAFT_STATUS);
    expect(OPEN_STATUSES).not.toContain(DRAFT_STATUS);
  });

  it("still has a label, because a draft can be rendered on the V2 cart", () => {
    expect(STATUS_LABEL[DRAFT_STATUS]).toBeTruthy();
  });
});
