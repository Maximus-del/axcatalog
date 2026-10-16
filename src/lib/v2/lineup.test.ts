import { describe, expect, it } from "vitest";
import { imageProblem, lifecycleOf, toLineupProduct } from "./lineup";

const img = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  storage_bucket: "external",
  storage_path: `https://cdn.shopify.com/${id}.jpg`,
  is_primary: false,
  sort_order: 0,
  metadata: {},
  ...o,
});

describe("portal lineup", () => {
  it("uses the first two photos when nothing is chosen", () => {
    const p = toLineupProduct({ id: "p", title: "Hoodie", status: "published" }, [img("a", { is_primary: true }), img("b", { sort_order: 1 })], []);
    expect(p.front?.id).toBe("a");
    expect(p.back?.id).toBe("b");
  });

  it("honours AX's Front and Back choice over the website order", () => {
    const p = toLineupProduct(
      { id: "p", title: "Hoodie", status: "published" },
      [img("a", { is_primary: true }), img("b", { sort_order: 1 }), img("c", { sort_order: 2, metadata: { portal_view: "front" } }), img("d", { sort_order: 3, metadata: { portal_view: "back" } })],
      [],
    );
    expect(p.front?.id).toBe("c");
    expect(p.back?.id).toBe("d");
  });

  it("never shows photos Shopify removed", () => {
    const p = toLineupProduct({ id: "p", title: "x", status: "published" }, [img("gone", { is_primary: true, metadata: { shopify_orphaned: true } }), img("ok")], []);
    expect(p.images.map((i) => i.id)).toEqual(["ok"]);
  });

  it("only marks pictures added here as removable", () => {
    const p = toLineupProduct(
      { id: "p", title: "x", status: "archived" },
      [img("shop"), img("mine", { storage_bucket: "product-images", storage_path: "p/portal-1.png", metadata: { source: "ax_portal_upload" } })],
      ["c1"],
    );
    expect(p.images.find((i) => i.id === "shop")?.axUpload).toBe(false);
    expect(p.images.find((i) => i.id === "mine")?.axUpload).toBe(true);
    expect(p.lifecycle).toBe("archive");
    expect(p.collectionIds).toEqual(["c1"]);
  });

  it("maps store status to the client's tabs", () => {
    expect(lifecycleOf("published")).toBe("live");
    expect(lifecycleOf("archived")).toBe("archive");
    expect(lifecycleOf("draft")).toBe("hidden");
    expect(lifecycleOf("internal")).toBe("hidden");
  });

  it("accepts web images only", () => {
    expect(imageProblem({ type: "image/webp", size: 10 })).toBeNull();
    expect(imageProblem({ type: "image/heic", size: 10 })).toMatch(/PNG/);
  });
});
