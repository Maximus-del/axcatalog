import { describe, expect, it } from "vitest";
import {
  bulkCost,
  codeExample,
  discountFor,
  monthsToFullCredit,
  parsePlaybook,
  resaleExample,
  storeShareExample,
} from "./playbook";

// The shape portal_brand_playbook returned for Darnell Mooney on 2026-10-17.
const LIVE = {
  code: null,
  terms: null,
  credit: { max: 3000, balance: 2500, monthly: 500 },
  bulkSamples: [
    { kind: "hoodie", title: "Mooney World WRLD #11 Hoodie", retail: 65, productId: "h", athleteUnit: 35, compareUnit: 48 },
    { kind: "tee", title: "Mooney World Signature Jersey #1 Tee", retail: 45, productId: "t", athleteUnit: 18, compareUnit: 25 },
  ],
  volumeBreaks: [
    { percent: 10, minUnits: 50 },
    { percent: 15, minUnits: 100 },
    { percent: 20, minUnits: 250 },
    { percent: 25, minUnits: 500 },
  ],
  rushSurcharge: 40,
};

describe("parsePlaybook", () => {
  it("reads the live shape and puts the tee first", () => {
    const p = parsePlaybook(LIVE);
    expect(p.bulkSamples.map((s) => s.kind)).toEqual(["tee", "hoodie"]);
    expect(p.credit).toEqual({ balance: 2500, monthly: 500, max: 3000 });
    expect(p.terms).toBeNull();
    expect(p.code).toBeNull();
    expect(p.volumeBreaks[0]).toEqual({ minUnits: 50, percent: 10 });
  });

  it("keeps an unset share null instead of zero", () => {
    const p = parsePlaybook({ ...LIVE, terms: { revenueSharePercent: null, payoutSchedule: "", note: null } });
    expect(p.terms).toEqual({ revenueSharePercent: null, payoutSchedule: null, note: null, splitBasis: "gross", paymentInstructions: null });
  });

  it("survives an empty payload", () => {
    const p = parsePlaybook(null);
    expect(p.volumeBreaks).toEqual([]);
    expect(p.bulkSamples).toEqual([]);
    expect(p.credit).toBeNull();
  });
});

describe("the maths matches the order sheet", () => {
  const { volumeBreaks } = parsePlaybook(LIVE);

  it("applies the same ladder as portal_quote_order", () => {
    expect(discountFor(49, volumeBreaks)).toBe(0);
    expect(discountFor(50, volumeBreaks)).toBe(10);
    expect(discountFor(250, volumeBreaks)).toBe(20);
    expect(discountFor(1000, volumeBreaks)).toBe(25);
  });

  it("prices 50 tees at $18 less 10%", () => {
    const c = bulkCost({ athleteUnit: 18, compareUnit: 25 }, 50, volumeBreaks);
    expect(c).toMatchObject({ percent: 10, total: 810, perUnit: 16.2, standard: 1250, saved: 440 });
  });

  it("shows resale profit at the store price", () => {
    const tee = parsePlaybook(LIVE).bulkSamples[0];
    expect(resaleExample(tee, 50, volumeBreaks)).toMatchObject({ revenue: 2250, total: 810, profit: 1440 });
    expect(resaleExample({ ...tee, retail: null }, 50, volumeBreaks)).toBeNull();
  });

  it("only shows a store-share example once AX sets the share", () => {
    expect(storeShareExample(45, null)).toBeNull();
    expect(storeShareExample(45, 20, 100)).toEqual({ units: 100, gross: 4500, profitPerUnit: null, earned: 900, perUnit: 9 });
    // Profit basis: $45 − his $26 cost = $19; he keeps 90% = $17.10 a sale.
    expect(storeShareExample(45, 90, 100, { basis: "profit", clientCost: 26 })).toEqual({ units: 100, gross: 4500, profitPerUnit: 19, perUnit: 17.1, earned: 1710 });
    expect(storeShareExample(45, 90, 100, { basis: "profit", clientCost: null })).toBeNull();
  });

  it("code earnings come from the commission, fan savings from the discount", () => {
    expect(codeExample(null)).toBeNull();
    expect(codeExample({ code: "MOONEY", live: true, fanDiscountPercent: 10, commissionPercent: 20 })).toEqual({
      fanSpend: 1000,
      fanSaves: 100,
      earned: 200,
    });
  });

  it("months to a full credit wallet", () => {
    expect(monthsToFullCredit({ balance: 2500, monthly: 500, max: 3000 })).toBe(1);
    expect(monthsToFullCredit({ balance: 3000, monthly: 500, max: 3000 })).toBeNull();
    expect(monthsToFullCredit({ balance: 0, monthly: 0, max: 3000 })).toBeNull();
  });
});
