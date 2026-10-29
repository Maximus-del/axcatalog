import { describe, expect, it } from "vitest";
import { defaultTags, parseTags, toProductGid } from "./studio-shopify";

describe("studio -> shopify helpers", () => {
  it("normalises product ids to Shopify gids", () => {
    expect(toProductGid("gid://shopify/Product/8527493890238")).toBe("gid://shopify/Product/8527493890238");
    expect(toProductGid("8527493890238")).toBe("gid://shopify/Product/8527493890238");
  });
  it("tags: client name by default, comma list de-duplicated", () => {
    expect(defaultTags("Proactive Sports Performance")).toEqual(["Proactive Sports Performance"]);
    expect(defaultTags(null)).toEqual([]);
    expect(parseTags(" Proactive, Provengers ,, Proactive ")).toEqual(["Proactive", "Provengers"]);
  });
});
