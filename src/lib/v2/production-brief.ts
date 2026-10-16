// Production prompts — the master ChatGPT prompt that packages an approved
// design into the Drive library, and the per-design brief that goes with it.
//
// The master prompt lives here, in code, so it is versioned with the folder
// rules the Drive sync reads (supabase/functions/_shared/drive-product-images):
// change the folder layout and this file changes in the same commit.
//
// Everything here is pure; the screen is components/admin-v2/ProductionBrief.

export const MASTER_PROMPT_VERSION = "2026-10-16";

export const MASTER_PROMPT = `You are the production assistant for Athlete Xclusive (AX), an athlete merchandise company. For every design I send, package it into production files for our Drive master library. I attach the approved design plus a short brief each time. Follow these rules unless my brief says otherwise.

GOLDEN RULE
The attached image is the APPROVED artwork. For layers and print files, work from that exact image with code (Python). Never regenerate or redraw it. Image generation is only for colorway mockups and variant concepts.

OWNERS AND CODES
OWNER = athlete last name (MOONEY, SHAREEF), client (PROACTIVE), or city code for city lines (ATL, BAL, BUF, CHI, KC, LA, LV, MIA, SEA).
LINE CODE = short prefix for a line: MW = Mooney World, ATL/BUF/etc. = city lines.

FOLDER STRUCTURE (the ZIP must match this exactly)
<DESIGN FOLDER>/
  ART/MASTER/      layered PSD + separated layer PNGs
  ART/PRINT/       print-ready transparent PNGs
  ART/VARIANTS/    concepts, one subfolder per variant (VAR-A, VAR-B, #11, etc.)
  <GARMENT> — <BLANK>/        e.g. "TEE — AXISM 7010", "HOODIE — CC HOD475"
    <Color>/                  one folder per colorway, blank's real color name (Black, Graphite, Mocha)
    CONTACT_SHEETS/           one FRONT and one BACK contact sheet of all colors
Design folder name: LINE CODE + " — " + design name (e.g. "MW — COMIC BOOK", "ATL — WORLD TOUR"). No line? Just the design name.
Garments: TEE, HOODIE, CREWNECK, LONG SLEEVE, SWEATPANTS, HAT, KIDS TEE, KIDS HOODIE. Add V1/V2 after the garment when a design has versions (TEE V2 — AXISM 7010).

FILE NAMING (underscores, no spaces)
Art files: OWNER_DESIGNCODE_BASE_TYPE_v01.png
  TYPE = LAYER-NUMBER, LAYER-NAME, LAYER-SIGNATURE, LAYER-GRAPHIC, LAYER-TEXT, MASTER, PRINT-FRONT, PRINT-BACK
  e.g. ATL_ATL-STRENGTHCLUB_BASE_PRINT-FRONT_v01.png
Mockups: DESIGNCODE_MAKER_STYLE_Color_VIEW.png
  VIEW = FRONT, BACK, FLAT, MODEL (always the last word)
  e.g. ATL-STRENGTHCLUB_AXISM_7010_Black_FRONT.png, MW-COMICBOOK_CC_HOD475_Mocha_BACK.png
DESIGNCODE = line code + design, no spaces (MW-COMICBOOK, ATL-WORLDTOUR).

STEP 1 — LAYERS → ART/MASTER
With code, split the approved design into separate transparent PNGs, same canvas size and exact positions so they stack perfectly: NUMBER, NAME, SIGNATURE, GRAPHIC, TEXT (only the ones that exist). Then try to assemble a layered PSD with those layer names. If the PSD isn't reliable, say so and give the PNG layers only. Show a contact sheet so I can check the split, and tell me any part you couldn't separate cleanly.

STEP 2 — PRINT FILES → ART/PRINT
With code, remove the background from the approved design and export a transparent PNG at 300 DPI, one per placement (PRINT-FRONT, PRINT-BACK). Target at least 3600 px wide for a full front or back; a left-chest hit can be smaller. If the source is smaller, upscale with clean resampling (no AI redraw) and tell me original and final size and whether it looks soft. Clean edges, no halo.

STEP 3 — COLORWAY MOCKUPS → <GARMENT> — <BLANK>/<Color>
For every garment in my brief, make the BASE 3 colorways unless I list others: Black, a charcoal/graphite, and a brown (mocha). Use the blank's exact color names from my brief. In each color folder:
- FRONT: straight-on flatlay of the front, clean light-gray background, 4000×5000, realistic fabric and screen-print texture
- BACK: same, back view — only if the design prints on the back
- FLAT (optional): top-down styled flatlay, neutral surface, soft shadows, 4000×4000
Placement and scale true to real printing (center chest / left chest / full front / upper back per my brief). Every colorway keeps the same placement and scale. The design must match the approved art; change ink colors only where my brief says so for that colorway.
Then make CONTACT_SHEETS: one image of all FRONTs, one of all BACKs, labeled by color.

STEP 4 — VARIANTS → ART/VARIANTS
Three concepts, each clearly different:
- A — Colorway: same art, new ink colors that work on the base 3.
- B — Style: same layout, different treatment (distressed, vintage, chrome, embroidered look, outline-only).
- C — Wildcard: your best idea that still reads as the same design family.
For each: a preview (4000×5000) and one line on what changed. Label them CONCEPTS. If I approve one, I'll send it back as a new approved design.
If my brief asks for NUMBER VARIANTS (#11, #17), swap only the NUMBER layer, keep everything else identical, and export PRINT + a preview for each in ART/VARIANTS/#11 etc.

DELIVERY
One ZIP per design, named exactly like the design folder, structured as above, so I can unzip it straight into Drive. End with a short checklist: files made, layers skipped or messy, print resolution, anything I should fix.

Reply "Ready" and wait for my first design.`;

/** City lines: the owner code is also the line code (ATL — WORLD TOUR). */
export const CITIES: Array<{ code: string; name: string }> = [
  { code: "ATL", name: "Atlanta" },
  { code: "BAL", name: "Baltimore" },
  { code: "BUF", name: "Buffalo" },
  { code: "CHI", name: "Chicago" },
  { code: "KC", name: "Kansas City" },
  { code: "LA", name: "Los Angeles" },
  { code: "LV", name: "Las Vegas" },
  { code: "MIA", name: "Miami" },
  { code: "SEA", name: "Seattle" },
];

export const PLACEMENTS = [
  "front left chest + full back",
  "front center chest + full back",
  "front left chest only",
  "full front only",
  "full back only",
  "full front + full back",
] as const;

export interface BriefGarment {
  garment: string;
  blank: string;
  colors: string[];
}

export interface BriefInput {
  owner: string;
  lineCode: string;
  designName: string;
  garments: BriefGarment[];
  placement: string;
  numberVariants: string;
  notes: string;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** "MW" + "Comic Book" → "MW — COMIC BOOK"; no line → "COMIC BOOK". */
export function designFolder(lineCode: string, designName: string): string {
  const name = clean(designName).toUpperCase();
  const code = clean(lineCode).toUpperCase();
  if (!name) return code ? `${code} — …` : "";
  return code ? `${code} — ${name}` : name;
}

/** An athlete's display name → the owner code: the last name, uppercase. */
export function ownerFromName(name: string): string {
  const parts = clean(name).split(" ");
  return (parts[parts.length - 1] ?? "").toUpperCase();
}

/** A blank → the folder label: "AXISM 7010", "CC HOD475". */
export function blankLabel(supplier: string | null, styleCode: string | null): string {
  const s = (supplier ?? "").trim();
  const code = (styleCode ?? "").trim().toUpperCase();
  if (/cotton collective/i.test(s)) return `CC ${code.replace(/^CC/, "")}`.trim();
  return `${s.toUpperCase()} ${code}`.trim();
}

/** v2_blanks.garment_type → the garment word used in folder names. */
export function garmentWord(garmentType: string | null, name = ""): string {
  switch (garmentType) {
    case "tee":
      return "TEE";
    case "hoodie":
      return "HOODIE";
    case "zip_hoodie":
      return "ZIP HOODIE";
    case "crewneck":
      return "CREWNECK";
    case "long_sleeve":
      return "LONG SLEEVE";
    case "sweatpants":
      return "SWEATPANTS";
    case "hat":
      return "HAT";
    default:
      return /jacket/i.test(name) ? "JACKET" : "GARMENT";
  }
}

const BASE_PATTERNS = [/graphite|charcoal|smoke|slate|caviar/i, /mocha|brown|chocolate|tobacco|mahogany|almond/i];

/**
 * The base 3 from a blank's colors: Black, a charcoal/graphite, a brown.
 * Uses the blank's own names (so the brief matches what can be ordered) and
 * skips any it does not carry.
 */
export function baseThree(colorNames: string[]): string[] {
  const names = colorNames.map((c) => c.trim()).filter(Boolean);
  const out: string[] = [];
  const black = names.find((c) => /^black$/i.test(c)) ?? names.find((c) => /\bblack\b/i.test(c) && !/white/i.test(c));
  if (black) out.push(black);
  for (const re of BASE_PATTERNS) {
    const hit = names.find((c) => re.test(c) && !out.includes(c));
    if (hit) out.push(hit);
  }
  return out;
}

/** The brief, exactly as it is pasted under the master prompt. */
export function buildBrief(b: BriefInput): string {
  const garments = b.garments.filter((g) => g.garment && g.blank);
  const lines = [
    `Owner: ${clean(b.owner).toUpperCase() || "…"}`,
    `Design folder: ${designFolder(b.lineCode, b.designName) || "…"}`,
    `Garments + blanks: ${garments.map((g) => `${g.garment} — ${g.blank}`).join(", ") || "…"}`,
  ];
  const colorSets = garments.map((g) => g.colors.join(", "));
  if (garments.length > 1 && new Set(colorSets).size > 1) {
    lines.push("Colors:");
    for (const g of garments) lines.push(`  ${g.garment} — ${g.blank}: ${g.colors.join(", ") || "base 3"}`);
  } else {
    lines.push(`Colors: ${colorSets[0] || "Black, Graphite, Mocha"}`);
  }
  lines.push(`Placement: ${clean(b.placement) || "…"}`);
  lines.push(`Number variants: ${clean(b.numberVariants) || "none"}`);
  lines.push(`Notes: ${b.notes.trim()}`);
  return lines.join("\n");
}

/** Prompt + brief together, for a brand-new chat. */
export function fullMessage(b: BriefInput): string {
  const prompt = MASTER_PROMPT.replace(/\n\nReply "Ready" and wait for my first design\.$/, "");
  return `${prompt}\n\n---\n\nFIRST DESIGN (approved art attached):\n${buildBrief(b)}`;
}
