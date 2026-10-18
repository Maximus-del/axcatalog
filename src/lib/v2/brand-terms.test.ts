import { describe, expect, it } from "vitest";
import { brandTermsError, mergeBrandTerms, parseBrandTerms, EMPTY_TERMS } from "./brand-terms";

describe("brand terms", () => {
  it("reads what the playbook RPC reads", () => {
    expect(parseBrandTerms({ revenue_share_percent: 20, payout_schedule: "Monthly", note: null })).toEqual({
      revenueSharePercent: 20,
      payoutSchedule: "Monthly",
      note: "",
    });
    expect(parseBrandTerms(undefined)).toEqual(EMPTY_TERMS);
  });

  it("keeps every other metadata key and removes the block when emptied", () => {
    const meta = { portal_theme: { layout: "world" }, brand_terms: { revenue_share_percent: 20 } };
    expect(mergeBrandTerms(meta, { revenueSharePercent: 25, payoutSchedule: " Monthly ", note: "" })).toEqual({
      portal_theme: { layout: "world" },
      brand_terms: { revenue_share_percent: 25, payout_schedule: "Monthly", note: null },
    });
    expect(mergeBrandTerms(meta, EMPTY_TERMS)).toEqual({ portal_theme: { layout: "world" } });
  });

  it("rejects an impossible share", () => {
    expect(brandTermsError({ ...EMPTY_TERMS, revenueSharePercent: 120 })).toMatch(/between/);
    expect(brandTermsError({ ...EMPTY_TERMS, revenueSharePercent: 20 })).toBeNull();
  });
});
