import { describe, expect, it } from "vitest";
import {
  axBin, categoryFromPath, lineName, newestIndex, ownerOf, planRow, titleFromFileName, titleFromIndex, TEMPLATE_NOTE,
  type IndexAsset, type Owner,
} from "../../../supabase/functions/_shared/content-intake";

const PRO = "972f0aa1-e9d7-490e-b73d-4644bbe2eacb";
const MOO = "74bb5183-5a2b-443b-9b07-bf52ef89c722";
const owners: Owner[] = [
  { athleteId: PRO, folders: ["PROACTIVE"] },
  { athleteId: MOO, folders: ["DARNELL MOONEY", "MOONEY"] },
];

describe("content intake routing", () => {
  it("client folders go to the client, everything else to AX", () => {
    expect(ownerOf("PROACTIVE", owners)).toBe(PRO);
    expect(ownerOf("darnell  mooney", owners)).toBe(MOO);
    expect(ownerOf("WEBSITE CONTENT — COLLECTIONS & SERVICES — 2026-09", owners)).toBeNull();
    expect(axBin("WEBSITE CONTENT — COLLECTIONS & SERVICES — 2026-09")).toBe("website");
    expect(axBin("WORLD TOUR")).toBe("world-tour");
    expect(axBin("ACTIVE SHOPIFY PRODUCTS — CAMPAIGN LIBRARY")).toBe("campaign-library");
  });

  it("reads the category from the folder it sits in", () => {
    expect(categoryFromPath(["PROACTIVE", "PSP", "01_PROMOTIONAL", "01_DISCOUNT"])).toBe("discount");
    expect(categoryFromPath(["MOONEY", "MW", "02_PHOTO-SHOOT", "03_GHOST-MANNEQUINS"])).toBe("ghost");
    expect(categoryFromPath(["X", "03_MODEL-SHOOTS"])).toBe("model");
    expect(categoryFromPath(["WEBSITE CONTENT"])).toBeNull();
  });

  it("names things the way the portal does", () => {
    expect(lineName("PSP-STRENGTHCLUB_ECRU_2026-10")).toBe("Strength Club");
    expect(lineName("MW-FOOTBALLTOUR_NYG17_BLACK_2026-10")).toBe("Football Tour #17");
    expect(lineName("MW-WRLD_NYG17_BLACK_2026-10")).toBe("WRLD #17");
    const a: IndexAsset = { drive_file_id: "x", campaign: "PSP-STRENGTHCLUB_ECRU_2026-10", color: "Ecru", category: "discount", creative_type: "SAVE10", discount_percent: 10, format: "IG-FEED 4x5" };
    expect(titleFromIndex(a)).toBe("Strength Club · Ecru — Save 10% (Feed post)");
    expect(titleFromFileName("03-steven-shareef-wide-hero.png")).toBe("Steven shareef wide hero");
  });

  it("skips archives and non-media, and waits for review", () => {
    const index = new Map<string, IndexAsset>();
    expect(planRow({ id: "a", name: "m.json", mimeType: "application/json", path: ["PROACTIVE"] }, owners, index)).toBeNull();
    expect(planRow({ id: "b", name: "x.png", mimeType: "image/png", path: ["PROACTIVE", "C", "99_METADATA-ARCHIVE"] }, owners, index)).toBeNull();
    const row = planRow({ id: "c", name: "SAVE10.png", mimeType: "image/png", path: ["PROACTIVE", "C", "01_PROMOTIONAL", "01_DISCOUNT"] }, owners, index)!;
    expect(row).toMatchObject({ sourceKey: "drive:c", athleteId: PRO, category: "discount", body: TEMPLATE_NOTE, type: "photo" });
    const site = planRow({ id: "d", name: "16-brand-hero.png", mimeType: "image/png", path: ["WEBSITE CONTENT — 2026-09"] }, owners, index)!;
    expect(site).toMatchObject({ athleteId: null, bucket: "website", category: "website", title: "Brand hero" });
  });

  it("uses the newest index file", () => {
    expect(newestIndex([{ name: "AX-SOCIAL-ASSET-INDEX_v02.json" }, { name: "AX-SOCIAL-ASSET-INDEX_v03.json" }, { name: "notes.txt" }])?.name).toBe("AX-SOCIAL-ASSET-INDEX_v03.json");
  });
});
