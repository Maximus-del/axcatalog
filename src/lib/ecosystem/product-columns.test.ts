import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ATHLETE_COLS, PRODUCT_COLS } from "./services";

/**
 * A PostgREST select is a string. TypeScript cannot check it, and the fan
 * service layer casts every table name through `as never`, so nothing checks
 * it at all — a column the interface declares but the select omits simply
 * arrives as undefined.
 *
 * That is not hypothetical. PRODUCT_COLS was missing access_date, public_date
 * and drop_date while PublicAthleteProduct declared all three and the
 * public_athlete_products view returned all three. earlyAccess() therefore
 * received undefined twice on every call and returned { phase: "none" }, which
 * silently disabled the member early-access banner and the "Get Access"
 * upsell on every product page — the exact feature the Access tab sells.
 *
 * This test reads the interfaces out of types.ts and asserts the select
 * strings cover them.
 */

const TYPES = readFileSync(join(process.cwd(), "src", "lib", "ecosystem", "types.ts"), "utf8");

/** Field names declared by an interface in types.ts, optional ones included. */
function fieldsOf(interfaceName: string): string[] {
  const start = TYPES.indexOf(`export interface ${interfaceName} {`);
  if (start === -1) throw new Error(`interface ${interfaceName} not found in types.ts`);
  const open = TYPES.indexOf("{", start);
  const close = TYPES.indexOf("\n}", open);
  const body = TYPES.slice(open + 1, close);
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("*") && !line.startsWith("/*"))
    .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)\??\s*:/)?.[1])
    .filter((n): n is string => !!n);
}

function selected(cols: string): string[] {
  return cols.split(",").map((c) => c.trim()).filter(Boolean);
}

describe("fan select strings cover their interfaces", () => {
  it("reads the interfaces", () => {
    expect(fieldsOf("PublicAthleteProduct").length).toBeGreaterThan(10);
    expect(fieldsOf("PublicAthlete").length).toBeGreaterThan(10);
  });

  it("PRODUCT_COLS selects every field PublicAthleteProduct declares", () => {
    const cols = selected(PRODUCT_COLS);
    const missing = fieldsOf("PublicAthleteProduct").filter((f) => !cols.includes(f));
    expect(
      missing,
      `PublicAthleteProduct declares these but PRODUCT_COLS does not select them, so they arrive undefined: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("ATHLETE_COLS selects every field PublicAthlete declares", () => {
    const cols = selected(ATHLETE_COLS);
    const missing = fieldsOf("PublicAthlete").filter((f) => !cols.includes(f));
    expect(missing, `missing from ATHLETE_COLS: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps the early-access dates specifically — they drive the whole feature", () => {
    const cols = selected(PRODUCT_COLS);
    expect(cols).toContain("access_date");
    expect(cols).toContain("public_date");
    expect(cols).toContain("drop_date");
  });

  it("selects no duplicates", () => {
    const cols = selected(PRODUCT_COLS);
    expect(new Set(cols).size).toBe(cols.length);
  });
});
