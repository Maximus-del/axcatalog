import { describe, expect, it } from "vitest";
import {
  desiredImages,
  driveImageUrl,
  isShowcaseFile,
  parseDriveFolderId,
  planDriveSync,
  preferDrive,
  sideFromName,
  colorFromFolder,
  type DriveFile,
} from "../../../supabase/functions/_shared/drive-product-images";
import { driveLinkOf, toLineupProduct } from "./lineup";

const png = (id: string, name: string, modifiedTime = "2026-10-16T18:00:00Z"): DriveFile => ({ id, name, mimeType: "image/png", modifiedTime });

// The real Signature Jersey layout: a shared front folder, then the edition's back.
const SHARED = "17Fqgs5bMcbRK2f9Ktcq49dFcwjxUtMhC";
const VAR_B = "1xPj-eMzT4xrK2NKo45vJDmhN7mCP9sQv";
const VAR_A = "1XkBQ3uv69Kq3MbxuIJdJFC3YZqtxeJya";
const files: Record<string, DriveFile[]> = {
  [SHARED]: [
    png("print", "MOONEY_SIGNATUREJERSEY_BASE_PRINT-FRONT_v01.png"),
    png("flat", "MOONEY_SIGNATUREJERSEY_BASE_FLAT_v01.png"),
    png("front", "MOONEY_SIGNATUREJERSEY_BASE_PREVIEW-FRONT_v01.png"),
    { id: "zip", name: "MOONEY_SIGNATUREJERSEY_BASE_MASTER_v01.zip", mimeType: "application/zip", modifiedTime: null },
  ],
  [VAR_B]: [png("backB", "MOONEY_SIGNATUREJERSEY_#11_PREVIEW-BACK_v01.png")],
  [VAR_A]: [png("backA", "MOONEY_SIGNATUREJERSEY_#11_PREVIEW-BACK_v01.png")],
};
const sources = [{ id: SHARED }, { id: VAR_B }, { id: VAR_A }];

describe("drive naming", () => {
  it("shows previews and flats, never production art", () => {
    expect(isShowcaseFile(png("a", "X_BASE_PREVIEW-FRONT_v01.png"))).toBe(true);
    expect(isShowcaseFile(png("a", "X_BASE_FLAT_v01.png"))).toBe(true);
    expect(isShowcaseFile(png("a", "X_BASE_PRINT-FRONT_v01.png"))).toBe(false);
    expect(isShowcaseFile(png("a", "X_BASE_LAYER-NUMBER_v01.png"))).toBe(false);
    expect(isShowcaseFile(png("a", "X_BASE_CONCEPT-BOARD_v01.jpg"))).toBe(false);
    expect(isShowcaseFile({ name: "X_PREVIEW-FRONT.zip", mimeType: "application/zip" })).toBe(false);
  });
  it("reads the side from the name", () => {
    expect(sideFromName("X_#1_PREVIEW-BACK_v01.png")).toBe("back");
    expect(sideFromName("X_BASE_PREVIEW-FRONT_v01.png")).toBe("front");
    expect(sideFromName("X_BASE_FLAT_v01.png")).toBeNull();
  });
  it("parses folder links and bare ids", () => {
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${SHARED}?usp=sharing`)).toBe(SHARED);
    expect(parseDriveFolderId(`  ${VAR_B} `)).toBe(VAR_B);
    expect(parseDriveFolderId("not a link")).toBeNull();
  });
  it("busts the cache when the file changes", () => {
    expect(driveImageUrl("abc", "2026-10-16T18:00:00Z")).not.toBe(driveImageUrl("abc", "2026-10-17T18:00:00Z"));
    expect(driveImageUrl("abc", null)).toBe("https://drive.google.com/thumbnail?id=abc&sz=w1600");
  });
});

describe("planDriveSync", () => {
  it("orders folders as listed, front first and primary, back from option B", () => {
    const d = desiredImages(sources, files);
    expect(d.map((x) => x.fileId)).toEqual(["front", "flat", "backB", "backA"]);
    expect(d.filter((x) => x.isPrimary).map((x) => x.fileId)).toEqual(["front"]);
  });

  it("inserts everything with one front and one back on a first sync", () => {
    const plan = planDriveSync(sources, files, []);
    expect(plan.insert).toHaveLength(4);
    expect(plan.update).toHaveLength(0);
    const views = Object.fromEntries(plan.insert.map((r) => [r.metadata.drive_file_id, r.metadata.portal_view ?? null]));
    expect(views).toEqual({ front: "front", flat: null, backB: "back", backA: null });
    expect(plan.insert.every((r) => r.metadata.source === "drive")).toBe(true);
  });

  it("is a no-op when nothing changed", () => {
    const first = planDriveSync(sources, files, []);
    const rows = first.insert.map((r, i) => ({ id: `r${i}`, ...r }));
    const again = planDriveSync(sources, files, rows);
    expect(again.insert.length + again.update.length + again.remove.length).toBe(0);
  });

  it("keeps a Back chosen in V2, removes files gone from Drive, updates replaced files", () => {
    const rows = planDriveSync(sources, files, []).insert.map((r, i) => ({ id: `r${i}`, ...r }));
    // Operator picked option A's back in V2.
    rows[2] = { ...rows[2], metadata: { ...rows[2].metadata } };
    delete rows[2].metadata.portal_view;
    rows[3] = { ...rows[3], metadata: { ...rows[3].metadata, portal_view: "back" } };
    const next = {
      ...files,
      [SHARED]: [png("front", "MOONEY_SIGNATUREJERSEY_BASE_PREVIEW-FRONT_v01.png", "2026-10-18T00:00:00Z")], // replaced; flat deleted
    };
    const plan = planDriveSync(sources, next, rows);
    expect(plan.remove).toEqual(["r1"]);
    const byFile = Object.fromEntries(plan.update.map((u) => [u.metadata.drive_file_id, u]));
    expect(byFile.front.storage_path).toContain("&v=");
    expect(byFile.backB?.metadata.portal_view ?? rows[2].metadata.portal_view).toBeUndefined();
    expect(plan.insert).toHaveLength(0);
  });

  it("never touches Shopify or AX-upload rows", () => {
    const plan = planDriveSync(sources, files, [
      { id: "shop", storage_path: "https://cdn.shopify.com/x.png", sort_order: 0, is_primary: true, metadata: { shopify_image_id: 1 } },
      { id: "ax", storage_path: "p/portal-1.png", sort_order: 1, is_primary: false, metadata: { source: "ax_portal_upload" } },
    ]);
    expect(plan.remove).toEqual([]);
    expect(plan.update).toEqual([]);
  });
});

describe("colorways", () => {
  it("orders loose files, then Black, then the other colors, and tags each picture", () => {
    const HOODIE = "1mo1XtfdppY-7oTl5pZI1yDWhyPAahhb8";
    const d = desiredImages([{ id: HOODIE }], {
      [HOODIE]: [
        { ...png("m1", "MOONEY_COMICBOOK_HOODIE_PREVIEW-FRONT_v01.png"), color: "MOCHA" },
        { ...png("c1", "MOONEY_COMICBOOK_HOODIE_PREVIEW-FRONT_v01.png"), color: "CHARCOAL OIL WASH" },
        { ...png("b2", "MOONEY_COMICBOOK_HOODIE_PREVIEW-BACK_v01.png"), color: "BLACK" },
        { ...png("b1", "MOONEY_COMICBOOK_HOODIE_PREVIEW-FRONT_v01.png"), color: "BLACK" },
      ],
    });
    expect(d.map((x) => x.fileId)).toEqual(["b1", "b2", "c1", "m1"]);
    expect(d[0].isPrimary).toBe(true);
    const plan = planDriveSync([{ id: HOODIE }], { [HOODIE]: [{ ...png("b1", "X_PREVIEW-FRONT.png"), color: "BLACK" }] }, []);
    expect(plan.insert[0].metadata.drive_color).toBe("BLACK");
    expect(colorFromFolder("CHARCOAL_OIL_WASH")).toBe("CHARCOAL OIL WASH");
  });
});

describe("preferDrive + lineup", () => {
  it("shows only Drive pictures when a product has them", () => {
    const imgs = [{ metadata: { shopify_image_id: 1 } }, { metadata: { source: "drive" } }];
    expect(preferDrive(imgs)).toEqual([imgs[1]]);
    expect(preferDrive([imgs[0]])).toEqual([imgs[0]]);
  });

  it("lineup product reads Drive link and hides website photos behind Drive", () => {
    const p = toLineupProduct(
      { id: "p1", title: "Signature Jersey #11", status: "published", metadata: { drive: { sources: [{ id: SHARED, label: "Shared front" }], synced_at: "2026-10-16T18:00:00Z", shown: 2 } } },
      [
        { id: "s", storage_bucket: "external", storage_path: "https://cdn.shopify.com/a.png", is_primary: true, sort_order: 0, metadata: {} },
        { id: "d1", storage_bucket: "external", storage_path: driveImageUrl("front", null), is_primary: true, sort_order: 0, metadata: { source: "drive", drive_name: "F.png", portal_view: "front" } },
        { id: "d2", storage_bucket: "external", storage_path: driveImageUrl("back", null), is_primary: false, sort_order: 1, metadata: { source: "drive", portal_view: "back" } },
      ],
      [],
    );
    expect(p.images.map((i) => i.id)).toEqual(["d1", "d2"]);
    expect(p.front?.id).toBe("d1");
    expect(p.back?.id).toBe("d2");
    expect(p.images[0].fromDrive && p.images[0].driveName).toBe("F.png");
    expect(p.drive).toMatchObject({ shown: 2, sources: [{ id: SHARED, label: "Shared front" }] });
    expect(driveLinkOf({})).toBeNull();
  });
});
