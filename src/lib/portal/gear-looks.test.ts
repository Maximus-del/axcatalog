import { describe, expect, it } from "vitest";
import { colourKeysFromNames, gearLooks, sideOf } from "./gear-looks";
import { perMonth } from "./brand-insights";

const img = (url: string, i: number, extra: Record<string, unknown> = {}) => ({ id: String(i), url, is_primary: i === 0, sort_order: i, shopifyImageId: null, portalView: null, ...extra }) as never;
const base = "https://cdn.shopify.com/s/files/1/x/files/";

describe("gear looks", () => {
  it("reads colours and sides from library file names", () => {
    const urls = ["sulfur-brown-front", "sulfur-brown-back", "black-front", "black-back", "pine-green-front", "pistachio-front"].map((c) => `${base}proactive-strength-capable-${c}.png?v=1`);
    expect(colourKeysFromNames(urls)).toEqual(["sulfur-brown", "sulfur-brown", "black", "black", "pine-green", "pistachio"]);
    const looks = gearLooks({ images: urls.map((u, i) => img(u, i)), colors: [], variants: [] } as never, () => []);
    expect(looks.map((l) => l.label)).toEqual(["Sulfur Brown", "Black", "Pine Green", "Pistachio"]);
    expect(looks[0].back).toContain("sulfur-brown-back");
    expect(looks[3].back).toBeNull();
  });
  it("handles -front-restored", () => {
    const urls = ["ecru", "black"].map((c) => `${base}proactive-university-heritage-${c}-front-restored.png`);
    expect(gearLooks({ images: urls.map((u, i) => img(u, i)), colors: [], variants: [] } as never, () => []).map((l) => l.label)).toEqual(["Ecru", "Black"]);
  });
  it("prefers AX's chosen side", () => {
    expect(sideOf({ url: `${base}a-front.png`, portalView: "back" })).toBe("back");
    expect(sideOf({ url: `${base}IceMan-03.png`, portalView: null })).toBe("front");
  });
  it("no pictures, no looks", () => {
    expect(gearLooks({ images: [], colors: [{ name: "Black", hex: null }], variants: [] } as never, () => [])).toEqual([]);
  });
});

describe("brand insights", () => {
  it("buckets orders and units by month, skipping cancelled", () => {
    const now = new Date(2026, 9, 21);
    const pts = perMonth([
      { createdAt: "2026-10-02T10:00:00", units: 50 },
      { createdAt: "2026-10-09T10:00:00", units: 24, status: "cancelled" },
      { createdAt: "2026-08-15T10:00:00", units: 12 },
      { createdAt: "2025-01-01T10:00:00", units: 99 },
    ], 3, "units", now);
    expect(pts).toEqual([{ month: "2026-08", value: 12 }, { month: "2026-09", value: 0 }, { month: "2026-10", value: 50 }]);
    expect(perMonth([{ createdAt: "2026-10-02T10:00:00", units: 50 }], 1, "orders", now)).toEqual([{ month: "2026-10", value: 1 }]);
  });
});

describe("gear looks — tagged and unnamed pictures", () => {
  it("groups by the colour each picture is tagged with", () => {
    const imgs = [["Almond", "front"], ["Almond", "back"], ["Black", "front"], ["Black", "back"]].map(([c, v], i) => img(`${base}download_${i}abc.png`, i, { color: c, portalView: v }));
    const looks = gearLooks({ images: imgs, colors: [], variants: [] } as never, () => []);
    expect(looks.map((l) => [l.label, !!l.back])).toEqual([["Almond", true], ["Black", true]]);
  });
  it("never shows a hash as a colour", () => {
    expect(colourKeysFromNames([`${base}download_e69fe84a-81a6.png`, `${base}download_26c58155-3646.png`])).toBeNull();
    expect(colourKeysFromNames([`${base}IceMan-03.png`, `${base}IceMan-01.png`])).toBeNull();
  });
});
