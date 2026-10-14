// AX OS V2 — rebuilding flattened mockup previews in bulk.
//
// Every composite rendered before the image-proxy existed lost its garment:
// V2 blank photography is Google Drive, Drive sends no CORS header, and a
// canvas that cannot read an image back silently drew nothing. What got saved
// was artwork on a dark square.
//
// Those mockups are otherwise completely correct — the row, the blank, the
// colourway and the placement geometry are all intact. Only the picture is
// wrong, and re-flattening is all it takes. Doing that one mockup at a time
// through the detail sheet is a chore proportional to how productive somebody
// has been, which is the wrong shape of penalty.
//
// Placements are fetched for the whole batch in ONE query rather than per
// mockup. Rendering then runs sequentially on purpose: each render decodes a
// full-size garment photograph onto a 1600px canvas, and firing twenty at once
// makes the tab unresponsive without finishing any sooner.

import { t } from "./db";
import { fromRows, type PlacementRow } from "./placement-geometry";
import { resolveBlankImage } from "./blank-image";
import { storeMockupComposite } from "./mockup-export";
import type { Blank, Design, Mockup } from "./types";

export interface RebuildOutcome {
  mockupId: string;
  title: string;
  ok: boolean;
  /** Why it failed, in words an operator can act on. */
  reason?: string;
}

export interface RebuildSummary {
  rebuilt: number;
  failed: RebuildOutcome[];
  /** Skipped because there is nothing placed on the front to flatten. */
  empty: number;
}

/**
 * Re-flatten the front of each mockup and store it as its cover.
 *
 * The FRONT specifically, because that is what a card shows. A back-only
 * mockup has no front composite to build and is counted as empty rather than
 * failed — nothing is wrong with it.
 */
export async function rebuildPreviews(input: {
  mockups: Mockup[];
  blanks: Blank[];
  designs: Design[];
  onProgress?: (done: number, total: number) => void;
}): Promise<RebuildSummary> {
  const { mockups, blanks, designs, onProgress } = input;
  const summary: RebuildSummary = { rebuilt: 0, failed: [], empty: 0 };
  if (mockups.length === 0) return summary;

  const ids = mockups.map((m) => m.id);
  const res = await t("product_print_placements")
    .select(
      "mockup_id, design_id, surface, zone_id, zone_label, x_pct, y_pct, w_pct, h_pct, rotation_deg, sort_order",
    )
    .in("mockup_id", ids);
  if (res.error) throw new Error(res.error.message);

  const byMockup = new Map<string, PlacementRow[]>();
  for (const row of (res.data ?? []) as unknown as Array<PlacementRow & { mockup_id: string }>) {
    const key = String(row.mockup_id);
    const list = byMockup.get(key) ?? [];
    list.push(row);
    byMockup.set(key, list);
  }

  const blanksById = new Map(blanks.map((b) => [b.id, b]));
  const designsById = new Map(designs.map((d) => [d.id, d]));

  let done = 0;
  for (const mockup of mockups) {
    const placed = fromRows(byMockup.get(mockup.id) ?? []).filter((p) => p.surface === "front");
    if (placed.length === 0) {
      summary.empty += 1;
      onProgress?.(++done, mockups.length);
      continue;
    }

    const garment = resolveBlankImage({
      blank: blanksById.get(mockup.blankId ?? "") ?? null,
      colorName: mockup.colorName,
      surface: "front",
    });

    const result = await storeMockupComposite({
      mockupId: mockup.id,
      garmentUrl: garment.url,
      placed,
      designsById,
    });

    // `ok === false` rather than `!ok`: strictNullChecks is off in this
    // project, which stops the discriminated union narrowing on truthiness.
    if (result.ok === false) {
      summary.failed.push({
        mockupId: mockup.id,
        title: mockup.title,
        ok: false,
        reason:
          result.reason === "garment"
            ? "the garment photograph could not be loaded"
            : (result.message ?? "the image could not be rendered"),
      });
    } else {
      summary.rebuilt += 1;
    }
    onProgress?.(++done, mockups.length);
  }

  return summary;
}

/**
 * What to tell the operator afterwards.
 *
 * One sentence that survives every combination, including the awkward middle
 * ones — some rebuilt, some empty, some failed — without a template that reads
 * "0 rebuilt, 0 failed".
 */
export function describeRebuild(summary: RebuildSummary): string {
  const bits: string[] = [];
  if (summary.rebuilt > 0) bits.push(`${summary.rebuilt} preview${summary.rebuilt === 1 ? "" : "s"} rebuilt`);
  if (summary.failed.length > 0) bits.push(`${summary.failed.length} could not be`);
  if (summary.empty > 0) bits.push(`${summary.empty} had nothing on the front`);
  return bits.length > 0 ? bits.join(", ") : "Nothing to rebuild";
}
