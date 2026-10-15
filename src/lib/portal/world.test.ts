import { describe, expect, it } from "vitest";
import { brandLines, resolveLayout, worldBrand } from "./world";
import { parsePortalTheme } from "./portal-theme";

describe("which shell a client gets", () => {
  const classic = parsePortalTheme({});
  const world = parsePortalTheme({ layout: "world" });

  it("is classic unless the client's theme says world", () => {
    expect(resolveLayout(classic, "", null)).toBe("classic");
    expect(resolveLayout(world, "", null)).toBe("world");
    expect(parsePortalTheme({ layout: "neon" }).layout).toBe("classic");
  });

  it("can be previewed with ?layout, and the preview is remembered", () => {
    expect(resolveLayout(classic, "?as=x&layout=world", null)).toBe("world");
    expect(resolveLayout(world, "?layout=classic", null)).toBe("classic");
    expect(resolveLayout(classic, "", "world")).toBe("world");
    expect(resolveLayout(classic, "?layout=nonsense", null)).toBe("classic");
  });
});

describe("the world's name", () => {
  it("never shows another client's brand", () => {
    expect(worldBrand({ brand: "Mooney World" }, "Mooney")).toBe("Mooney World");
    expect(worldBrand({ brand: "" }, "Coleman")).toBe("Coleman World");
    expect(worldBrand({ brand: "" }, ".", "Dashletics")).toBe("Dashletics World");
    expect(worldBrand({ brand: "" }, null, null)).toBe("Your World");
    expect(parsePortalTheme({ brand: "x".repeat(90) }).brand.length).toBe(32);
  });

  it("splits into two wordmark lines", () => {
    expect(brandLines("Mooney World")).toEqual(["Mooney", "World"]);
    expect(brandLines("Claypool")).toEqual(["Claypool", ""]);
  });
});
